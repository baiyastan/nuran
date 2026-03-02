"""
Expenses admin.
"""
from django.contrib import admin
from .models import ActualExpense


@admin.register(ActualExpense)
class ActualExpenseAdmin(admin.ModelAdmin):
    """Admin for ActualExpense (expenses app - keyed by month_period + scope)."""
    list_display = ('month_period', 'scope', 'category', 'amount', 'spent_at', 'created_by', 'created_at')
    list_filter = ('scope', 'month_period', 'spent_at', 'created_at')
    search_fields = ('comment', 'month_period__month')
    ordering = ('-spent_at', '-created_at')
    raw_id_fields = ('month_period', 'category', 'created_by')
