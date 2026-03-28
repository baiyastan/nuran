"""
Shared expense aggregation services.
"""
from datetime import date
from decimal import Decimal

from django.db.models import Sum

from apps.expenses.models import ActualExpense
from apps.finance.models import IncomeEntry, Transfer

from .base import get_expenses_for_month, extract_year_month


def get_balance_for_account(account, as_of_date, exclude_expense_id=None, exclude_transfer_id=None):
    """
    Compute available balance for an account (CASH or BANK) as of a given date.

    Debits use only apps.expenses.models.ActualExpense (CASH/BANK + spent_at). This matches
    DashboardKpiView cash_outflow_month / bank_outflow_month and expense_fact (which sums
    the same ActualExpense rows for the month, all scopes). apps.planning.ActualExpense is
    not used here — it has no account field and is not part of balance.

    Formula: income (IncomeEntry on this account) - those expenses + transfers_in - transfers_out.

    Args:
        account: 'CASH' or 'BANK'
        as_of_date: date object; movements up to and including this date are included
        exclude_expense_id: optional ActualExpense pk to exclude from expense sum (for update validation)
        exclude_transfer_id: optional Transfer pk to exclude from transfer sums (for update validation)

    Returns:
        Decimal: available balance (can be negative if no validation is applied elsewhere)
    """
    if as_of_date is None:
        return Decimal('0.00')

    inc = (
        IncomeEntry.objects.filter(account=account, received_at__lte=as_of_date)
        .aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    )
    exp_qs = ActualExpense.objects.filter(account=account, spent_at__lte=as_of_date)
    if exclude_expense_id is not None:
        exp_qs = exp_qs.exclude(pk=exclude_expense_id)
    exp = exp_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    tr_in_qs = Transfer.objects.filter(
        destination_account=account, transferred_at__lte=as_of_date
    )
    if exclude_transfer_id is not None:
        tr_in_qs = tr_in_qs.exclude(pk=exclude_transfer_id)
    tr_in = tr_in_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    tr_out_qs = Transfer.objects.filter(
        source_account=account, transferred_at__lte=as_of_date
    )
    if exclude_transfer_id is not None:
        tr_out_qs = tr_out_qs.exclude(pk=exclude_transfer_id)
    tr_out = tr_out_qs.aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
    return inc - exp + tr_in - tr_out


def assert_sufficient_balance(account, amount, spent_at, exclude_expense_id=None):
    """
    Raise if the account does not have sufficient balance for the given amount as of spent_at.
    Used to prevent negative balances on expense create/update.

    Args:
        account: 'CASH' or 'BANK'
        amount: Decimal expense amount
        spent_at: date of the expense
        exclude_expense_id: optional ActualExpense pk to exclude when computing balance (update case)

    Raises:
        ValueError: with message like "Insufficient balance on CASH. Available: 100.00"
    """
    from apps.finance.models import ACCOUNT_CHOICES
    if account not in dict(ACCOUNT_CHOICES):
        return
    balance = get_balance_for_account(account, spent_at, exclude_expense_id=exclude_expense_id)
    if balance < amount:
        label = dict(ACCOUNT_CHOICES).get(account, account)
        raise ValueError(
            f'Insufficient balance on {label}. Available: {balance:.2f}.'
        )


def sum_expenses(expenses_queryset, amount_field='amount'):
    """
    Sum expenses from a queryset.
    
    Args:
        expenses_queryset: QuerySet of expense objects
        amount_field: Name of the amount field to sum (default: 'amount')
        
    Returns:
        Decimal: Sum of expenses, or Decimal('0.00') if empty
    """
    result = expenses_queryset.aggregate(total=Sum(amount_field))['total']
    return result or Decimal('0.00')


def filter_by_month(expenses_queryset, month_str, date_field='spent_at'):
    """
    Filter expenses queryset by month.
    
    Args:
        expenses_queryset: QuerySet of expense objects
        month_str: Month string in YYYY-MM format
        date_field: Name of the date field to filter on (default: 'spent_at')
        
    Returns:
        QuerySet: Filtered queryset
    """
    return get_expenses_for_month(expenses_queryset, month_str, date_field)


def aggregate_by_category(expenses_queryset, amount_field='amount', category_field='category'):
    """
    Aggregate expenses by category, grouping and summing amounts.
    
    Args:
        expenses_queryset: QuerySet of expense objects with category FK
        amount_field: Name of the amount field to sum (default: 'amount')
        category_field: Name of the category FK field (default: 'category')
        
    Returns:
        dict: Dictionary mapping category_id to {'category_id', 'category_name', 'total': Decimal}
    """
    category_data = {}
    
    # Use select_related for efficiency
    expenses = expenses_queryset.select_related(category_field)
    
    for expense in expenses:
        category = getattr(expense, category_field, None)
        if category:
            category_id = category.id
            if category_id not in category_data:
                category_data[category_id] = {
                    'category_id': category_id,
                    'category_name': category.name,
                    'total': Decimal('0.00'),
                }
            amount = getattr(expense, amount_field, Decimal('0.00'))
            category_data[category_id]['total'] += amount
        else:
            # Handle null category expenses
            null_key = None
            if null_key not in category_data:
                category_data[null_key] = {
                    'category_id': None,
                    'category_name': 'Uncategorized',
                    'total': Decimal('0.00'),
                }
            amount = getattr(expense, amount_field, Decimal('0.00'))
            category_data[null_key]['total'] += amount
    
    return category_data


def aggregate_by_category_with_planned(expenses_queryset, planned_data, amount_field='amount', category_field='category'):
    """
    Aggregate expenses by category with planned amounts for comparison.
    
    Args:
        expenses_queryset: QuerySet of expense objects
        planned_data: Dict mapping category_id to planned amount
        amount_field: Name of the amount field to sum (default: 'amount')
        category_field: Name of the category FK field (default: 'category')
        
    Returns:
        list: List of dicts with 'category_id', 'category_name', 'planned', 'actual', 'delta', 'percent'
    """
    category_data = aggregate_by_category(expenses_queryset, amount_field, category_field)
    
    result_rows = []
    
    # Process all categories (both planned and actual)
    all_category_ids = set(planned_data.keys()) | set(category_data.keys())
    
    for category_id in all_category_ids:
        planned = planned_data.get(category_id, Decimal('0.00'))
        actual_data = category_data.get(category_id, {
            'category_id': category_id,
            'category_name': 'Unknown',
            'total': Decimal('0.00')
        })
        actual = actual_data['total']
        category_name = actual_data.get('category_name', 'Unknown')
        
        delta = actual - planned
        percent = (delta / planned * 100) if planned > 0 else Decimal('0.00')
        
        result_rows.append({
            'category_id': category_id,
            'category_name': category_name,
            'planned': float(planned),
            'actual': float(actual),
            'delta': float(delta),
            'percent': float(percent),
        })
    
    return result_rows


