"""
Finance API filters.
"""
import django_filters
from django.core.exceptions import ValidationError
from .models import IncomeEntry


class IncomeEntryFilter(django_filters.FilterSet):
    """FilterSet for IncomeEntry."""
    
    month = django_filters.CharFilter(method='filter_by_month', help_text='Filter by month (format: YYYY-MM)')
    fund_kind = django_filters.CharFilter(field_name='finance_period__fund_kind', lookup_expr='exact')
    project = django_filters.NumberFilter(field_name='finance_period__project', lookup_expr='exact')
    
    def filter_by_month(self, queryset, name, value):
        """Filter by received_at year/month from YYYY-MM format."""
        if not value:
            return queryset
        
        try:
            # Parse YYYY-MM format
            parts = value.split('-')
            if len(parts) != 2:
                raise ValueError("Invalid format")
            year = int(parts[0])
            month = int(parts[1])
            
            if month < 1 or month > 12:
                raise ValueError("Invalid month")
            
            return queryset.filter(
                received_at__year=year,
                received_at__month=month
            )
        except (ValueError, IndexError):
            # Return empty queryset for invalid format
            return queryset.none()
    
    class Meta:
        model = IncomeEntry
        fields = ['finance_period', 'month', 'fund_kind', 'project']

