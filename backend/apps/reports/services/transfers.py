"""Transfer listing / PDF context for reports."""
import calendar
from datetime import date
from decimal import Decimal

from django.db.models import Sum

from apps.finance.models import Transfer

from .helpers import to_decimal_str


def parse_month_to_date_bounds(month: str) -> tuple[date, date] | None:
    """Parse YYYY-MM into (first_day, last_day). Returns None if invalid."""
    try:
        year_int = int(month[:4])
        month_int = int(month[5:7])
        first_day = date(year_int, month_int, 1)
        last_day = date(year_int, month_int, calendar.monthrange(year_int, month_int)[1])
        return first_day, last_day
    except (ValueError, IndexError):
        return None


def build_transfer_details_payload(month: str) -> dict[str, object]:
    """Payload for TransferDetailsView."""
    bounds = parse_month_to_date_bounds(month)
    if bounds is None:
        return {'_parse_error': True}

    first_day, last_day = bounds

    base_qs = Transfer.objects.select_related('created_by').filter(
        transferred_at__gte=first_day,
        transferred_at__lte=last_day,
    )

    bank_to_cash_qs = base_qs.filter(source_account='BANK', destination_account='CASH')
    cash_to_bank_qs = base_qs.filter(source_account='CASH', destination_account='BANK')

    def serialize_transfer(t: Transfer) -> dict[str, object]:
        return {
            'id': t.id,
            'transferred_at': t.transferred_at.isoformat(),
            'source_account': t.source_account,
            'destination_account': t.destination_account,
            'amount': to_decimal_str(t.amount),
            'comment': t.comment or '',
            'created_by_username': t.created_by.username if t.created_by else None,
        }

    return {
        '_parse_error': False,
        'month': month,
        'bank_to_cash': [serialize_transfer(t) for t in bank_to_cash_qs],
        'cash_to_bank': [serialize_transfer(t) for t in cash_to_bank_qs],
    }


def query_transfers_for_direction_pdf(
    month: str,
    source_account: str,
    destination_account: str,
) -> tuple[Decimal, list] | None:
    """
    Transfers for one direction in a calendar month.

    Returns (total_amount, detail_rows) for build_transfer_direction_pdf, or None if month parse fails.
    """
    bounds = parse_month_to_date_bounds(month)
    if bounds is None:
        return None

    first_day, last_day = bounds

    qs = (
        Transfer.objects.filter(
            source_account=source_account,
            destination_account=destination_account,
            transferred_at__gte=first_day,
            transferred_at__lte=last_day,
        )
        .order_by('transferred_at', 'id')
    )

    total_amount = qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

    detail_rows = [
        {
            'transferred_at': t.transferred_at.isoformat(),
            'source_account': t.source_account,
            'destination_account': t.destination_account,
            'amount': t.amount,
            'comment': t.comment or '',
        }
        for t in qs
    ]

    return total_amount, detail_rows
