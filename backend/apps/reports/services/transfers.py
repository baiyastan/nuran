"""Transfer listing / PDF context for reports."""
import calendar
from datetime import date
from decimal import Decimal

from django.db.models import Sum

from apps.finance.models import Transfer, CurrencyExchange

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


def build_transfer_details_payload(
    month: str,
    currency: str | None = None,
) -> dict[str, object]:
    """Payload for TransferDetailsView."""
    bounds = parse_month_to_date_bounds(month)
    if bounds is None:
        return {'_parse_error': True}

    first_day, last_day = bounds

    base_qs = Transfer.objects.select_related('created_by').filter(
        transferred_at__gte=first_day,
        transferred_at__lte=last_day,
    )
    if currency in ('KGS', 'USD'):
        base_qs = base_qs.filter(currency=currency)

    bank_to_cash_qs = base_qs.filter(source_account='BANK', destination_account='CASH')
    cash_to_bank_qs = base_qs.filter(source_account='CASH', destination_account='BANK')

    def serialize_transfer(t: Transfer) -> dict[str, object]:
        return {
            'id': t.id,
            'transferred_at': t.transferred_at.isoformat(),
            'source_account': t.source_account,
            'destination_account': t.destination_account,
            'currency': t.currency,
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
    currency: str | None = None,
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
    if currency in ('KGS', 'USD'):
        qs = qs.filter(currency=currency)

    total_amount = qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

    detail_rows = [
        {
            'transferred_at': t.transferred_at.isoformat(),
            'source_account': t.source_account,
            'destination_account': t.destination_account,
            'currency': t.currency,
            'amount': t.amount,
            'comment': t.comment or '',
        }
        for t in qs
    ]

    return total_amount, detail_rows


def build_currency_exchange_details_payload(month: str) -> dict[str, object]:
    """
    List currency exchanges for a calendar month.
    Not filtered by currency: every exchange affects both KGS and USD buckets,
    so it is useful under any currency view.
    """
    bounds = parse_month_to_date_bounds(month)
    if bounds is None:
        return {'_parse_error': True}

    first_day, last_day = bounds
    qs = (
        CurrencyExchange.objects.select_related('created_by')
        .filter(exchanged_at__gte=first_day, exchanged_at__lte=last_day)
        .order_by('-exchanged_at', '-created_at')
    )

    def serialize(ex: CurrencyExchange) -> dict[str, object]:
        return {
            'id': ex.id,
            'exchanged_at': ex.exchanged_at.isoformat(),
            'source_account': ex.source_account,
            'source_currency': ex.source_currency,
            'source_amount': to_decimal_str(ex.source_amount),
            'destination_account': ex.destination_account,
            'destination_currency': ex.destination_currency,
            'destination_amount': to_decimal_str(ex.destination_amount),
            'comment': ex.comment or '',
            'created_by_username': ex.created_by.username if ex.created_by else None,
        }

    return {
        '_parse_error': False,
        'month': month,
        'results': [serialize(ex) for ex in qs],
    }
