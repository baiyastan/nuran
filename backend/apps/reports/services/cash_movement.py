"""Cash movement statement aggregates for account/date range exports."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Sum

from apps.expenses.models import ActualExpense
from apps.expenses.services import get_balance_for_account
from apps.finance.models import IncomeEntry, Transfer


def build_cash_movement_data(account: str, start_date, end_date) -> dict[str, Decimal]:
    """
    Build account statement totals for a period.

    Uses shared balance helper to avoid duplicating ledger logic.
    """
    opening_balance = get_balance_for_account(account, start_date - timedelta(days=1))
    closing_balance = get_balance_for_account(account, end_date)

    period_income = (
        IncomeEntry.objects.filter(
            account=account,
            received_at__gte=start_date,
            received_at__lte=end_date,
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    period_expense = (
        ActualExpense.objects.filter(
            account=account,
            spent_at__gte=start_date,
            spent_at__lte=end_date,
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )

    transfer_in = (
        Transfer.objects.filter(
            destination_account=account,
            transferred_at__gte=start_date,
            transferred_at__lte=end_date,
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    transfer_out = (
        Transfer.objects.filter(
            source_account=account,
            transferred_at__gte=start_date,
            transferred_at__lte=end_date,
        ).aggregate(total=Sum("amount"))["total"]
        or Decimal("0.00")
    )
    transfer_net = transfer_in - transfer_out

    return {
        "opening_balance": opening_balance,
        "period_income": period_income,
        "period_expense": period_expense,
        "transfer_net": transfer_net,
        "closing_balance": closing_balance,
    }
