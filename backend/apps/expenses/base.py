"""
Shared expense validation and query helpers.
"""
from django.core.exceptions import ValidationError
from apps.budgeting.models import MonthPeriod
from apps.finance.constants import MONTH_REQUIRED_MSG


def validate_expense_category(category, plan_scope=None):
    """
    Validate expense category.
    
    Args:
        category: ExpenseCategory instance
        plan_scope: Optional plan scope ('OFFICE', 'PROJECT', 'CHARITY') for scope matching
        
    Returns:
        dict: Empty dict if valid, or dict with error messages
        
    Raises:
        ValidationError: If validation fails
    """
    errors = {}
    
    if not category:
        return errors  # Allow None categories
    
    # Validate category is leaf
    if not category.is_leaf():
        errors['category'] = 'Category must be a leaf category (no children).'
    
    # Validate category is active
    if not category.is_active:
        errors['category'] = 'Category must be active.'
    
    # Validate category kind is EXPENSE
    if category.kind != 'EXPENSE':
        errors['category'] = f'Category kind must be EXPENSE. Current kind: {category.kind}'
    
    # Validate category scope matches plan scope (if plan_scope provided)
    if plan_scope and category:
        scope_mapping = {
            'office': 'OFFICE',
            'project': 'PROJECT',
            'charity': 'CHARITY'
        }
        expected_scope = scope_mapping.get(category.scope)
        if expected_scope and plan_scope != expected_scope:
            errors['category'] = f'Category scope "{category.scope}" does not match plan scope "{plan_scope}".'
    
    if errors:
        raise ValidationError(errors)
    
    return errors


def normalize_month_period(month_str):
    """
    Normalize month string to MonthPeriod instance.
    
    Args:
        month_str: Month string in YYYY-MM format
        
    Returns:
        MonthPeriod: MonthPeriod instance
        
    Raises:
        ValidationError: If format is invalid
    """
    if not month_str:
        raise ValidationError('Month string is required')
    
    month_str = month_str.strip()
    
    # Validate format
    if len(month_str) != 7 or month_str[4] != '-':
        raise ValidationError('Month must be in format YYYY-MM (e.g., 2024-01)')
    
    try:
        year, month_num = month_str.split('-')
        int(year)
        int(month_num)
    except (ValueError, AttributeError):
        raise ValidationError('Month must be in format YYYY-MM (e.g., 2024-01)')
    
    # Resolve existing MonthPeriod; do not auto-create.
    try:
        return MonthPeriod.objects.get(month=month_str)
    except MonthPeriod.DoesNotExist:
        # Month must be explicitly created/opened via MonthPeriod admin actions.
        raise ValidationError(MONTH_REQUIRED_MSG)


def extract_year_month(date_or_str):
    """
    Extract year and month from date or string.
    
    Args:
        date_or_str: Date object or YYYY-MM string
        
    Returns:
        tuple: (year, month) as strings
    """
    if isinstance(date_or_str, str):
        if len(date_or_str) == 7 and date_or_str[4] == '-':
            year, month = date_or_str.split('-')
            return year, month.zfill(2)
        raise ValueError(f'Invalid date string format: {date_or_str}')
    
    # Assume it's a date object
    return str(date_or_str.year), str(date_or_str.month).zfill(2)


def get_expenses_for_month(queryset, month_str, date_field='spent_at'):
    """
    Filter expenses queryset by month.
    
    Args:
        queryset: QuerySet of expense objects
        month_str: Month string in YYYY-MM format
        date_field: Name of the date field to filter on
        
    Returns:
        QuerySet: Filtered queryset
    """
    year, month = extract_year_month(month_str)
    return queryset.filter(**{
        f'{date_field}__year': year,
        f'{date_field}__month': month.lstrip('0') or '0'
    })


def get_expenses_for_period(queryset, period, date_field='spent_at'):
    """
    Filter expenses queryset by PlanPeriod or MonthPeriod.
    
    Args:
        queryset: QuerySet of expense objects
        period: PlanPeriod or MonthPeriod instance
        date_field: Name of the date field to filter on
        
    Returns:
        QuerySet: Filtered queryset
    """
    # Handle MonthPeriod
    if hasattr(period, 'month'):
        month_str = period.month
        return get_expenses_for_month(queryset, month_str, date_field)
    
    # Handle PlanPeriod
    if hasattr(period, 'period'):
        month_str = period.period
        return get_expenses_for_month(queryset, month_str, date_field)
    
    # Handle PlanPeriod with month_period FK
    if hasattr(period, 'month_period') and period.month_period:
        month_str = period.month_period.month
        return get_expenses_for_month(queryset, month_str, date_field)
    
    raise ValueError(f'Unsupported period type: {type(period)}')


