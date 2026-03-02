"""
Shared expense aggregation services.
"""
from django.db.models import Sum
from decimal import Decimal
from .base import get_expenses_for_month, extract_year_month


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


