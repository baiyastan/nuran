"""
Planning filters.
"""
import django_filters
from django.db import models
from .models import PlanItem


class PlanItemFilter(django_filters.FilterSet):
    """Filter for PlanItem."""
    
    status = django_filters.CharFilter(field_name='plan_period__status', lookup_expr='exact')
    project_id = django_filters.NumberFilter(field_name='plan_period__project_id', lookup_expr='exact')
    plan_period_id = django_filters.NumberFilter(field_name='plan_period_id', lookup_expr='exact')
    created_by = django_filters.NumberFilter(field_name='created_by_id', lookup_expr='exact')
    date_from = django_filters.DateFilter(field_name='created_at', lookup_expr='gte')
    date_to = django_filters.DateFilter(field_name='created_at', lookup_expr='lte')
    amount_min = django_filters.NumberFilter(field_name='amount', lookup_expr='gte')
    amount_max = django_filters.NumberFilter(field_name='amount', lookup_expr='lte')
    category = django_filters.CharFilter(field_name='category', lookup_expr='icontains')
    
    class Meta:
        model = PlanItem
        fields = ['status', 'project_id', 'plan_period_id', 'created_by', 'category']

