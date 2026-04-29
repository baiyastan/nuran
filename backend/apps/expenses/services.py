"""
Shared expense aggregation services.
"""
from decimal import Decimal

from django.db.models import Sum

from apps.expenses.models import ActualExpense
from apps.finance.models import IncomeEntry, Transfer, CurrencyExchange



def get_balance_for_account(
    account,
    as_of_date,
    currency='KGS',
    exclude_expense_id=None,
    exclude_transfer_id=None,
    exclude_exchange_id=None,
):
    """
    Compute available balance for an account (CASH or BANK) in a given currency as of a given date.

    Formula:
        income (IncomeEntry on this account+currency)
        - expenses (ActualExpense on this account+currency)
        + transfers_in - transfers_out (Transfer within the same currency)
        + exchanges_in (CurrencyExchange with destination_account+destination_currency match)
        - exchanges_out (CurrencyExchange with source_account+source_currency match)
    """
    if as_of_date is None:
        return Decimal('0.00')

    inc = (
        IncomeEntry.objects.filter(account=account, currency=currency, received_at__lte=as_of_date)
        .aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    )
    exp_qs = ActualExpense.objects.filter(account=account, currency=currency, spent_at__lte=as_of_date)
    if exclude_expense_id is not None:
        exp_qs = exp_qs.exclude(pk=exclude_expense_id)
    exp = exp_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    tr_in_qs = Transfer.objects.filter(
        destination_account=account, currency=currency, transferred_at__lte=as_of_date
    )
    if exclude_transfer_id is not None:
        tr_in_qs = tr_in_qs.exclude(pk=exclude_transfer_id)
    tr_in = tr_in_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    tr_out_qs = Transfer.objects.filter(
        source_account=account, currency=currency, transferred_at__lte=as_of_date
    )
    if exclude_transfer_id is not None:
        tr_out_qs = tr_out_qs.exclude(pk=exclude_transfer_id)
    tr_out = tr_out_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

    ex_in_qs = CurrencyExchange.objects.filter(
        destination_account=account, destination_currency=currency, exchanged_at__lte=as_of_date
    )
    if exclude_exchange_id is not None:
        ex_in_qs = ex_in_qs.exclude(pk=exclude_exchange_id)
    ex_in = ex_in_qs.aggregate(t=Sum('destination_amount'))['t'] or Decimal('0.00')

    ex_out_qs = CurrencyExchange.objects.filter(
        source_account=account, source_currency=currency, exchanged_at__lte=as_of_date
    )
    if exclude_exchange_id is not None:
        ex_out_qs = ex_out_qs.exclude(pk=exclude_exchange_id)
    ex_out = ex_out_qs.aggregate(t=Sum('source_amount'))['t'] or Decimal('0.00')

    return inc - exp + tr_in - tr_out + ex_in - ex_out


def assert_sufficient_balance(account, amount, spent_at, currency='KGS', exclude_expense_id=None):
    """
    Raise if the account does not have sufficient balance for the given amount as of spent_at.
    Used to prevent negative balances on expense create/update.

    Args:
        account: 'CASH' or 'BANK'
        amount: Decimal expense amount
        spent_at: date of the expense
        currency: 'KGS' or 'USD' (default: 'KGS')
        exclude_expense_id: optional ActualExpense pk to exclude when computing balance (update case)

    Raises:
        ValueError: with message like "Insufficient balance on CASH (KGS). Available: 100.00"
    """
    from apps.finance.models import ACCOUNT_CHOICES
    if account not in dict(ACCOUNT_CHOICES):
        return
    balance = get_balance_for_account(account, spent_at, currency=currency, exclude_expense_id=exclude_expense_id)
    if balance < amount:
        label = dict(ACCOUNT_CHOICES).get(account, account)
        raise ValueError(
            f'Insufficient balance on {label} ({currency}). Available: {balance:.2f}.'
        )




