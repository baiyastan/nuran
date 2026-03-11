"""
Finance admin.
"""
from django.contrib import admin
from .models import FinancePeriod, IncomeEntry, IncomeSource, IncomePlan, Transfer


@admin.register(IncomeSource)
class IncomeSourceAdmin(admin.ModelAdmin):
    """Admin for IncomeSource."""
    list_display = ('name', 'is_active', 'created_at', 'updated_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('name',)
    ordering = ('name',)


@admin.register(IncomePlan)
class IncomePlanAdmin(admin.ModelAdmin):
    """Admin for IncomePlan."""
    list_display = ('period', 'source', 'amount', 'created_at', 'updated_at')
    list_filter = ('period__fund_kind', 'source', 'created_at')
    search_fields = ('period__month_period__month', 'source__name')
    ordering = ('-created_at',)
    raw_id_fields = ('period', 'source')


@admin.register(FinancePeriod)
class FinancePeriodAdmin(admin.ModelAdmin):
    """Admin for FinancePeriod."""
    list_display = ('month_period', 'fund_kind', 'project', 'status', 'created_at')
    list_filter = ('fund_kind', 'status', 'created_at')
    search_fields = ('month_period__month', 'project__name')
    ordering = ('-month_period__month', '-created_at')
    raw_id_fields = ('month_period', 'project', 'created_by')


@admin.register(IncomeEntry)
class IncomeEntryAdmin(admin.ModelAdmin):
    """Admin for IncomeEntry."""
    list_display = ('finance_period', 'source', 'account', 'amount', 'received_at', 'created_at')
    list_filter = ('finance_period__fund_kind', 'source', 'account', 'received_at', 'created_at')
    search_fields = ('comment', 'finance_period__month_period__month')
    ordering = ('-received_at', '-created_at')
    raw_id_fields = ('finance_period', 'source', 'created_by')


@admin.register(Transfer)
class TransferAdmin(admin.ModelAdmin):
    """Admin for Transfer (internal cash↔bank)."""
    list_display = ('source_account', 'destination_account', 'amount', 'transferred_at', 'created_by', 'created_at')
    list_filter = ('source_account', 'destination_account', 'transferred_at')
    search_fields = ('comment',)
    ordering = ('-transferred_at', '-created_at')
    raw_id_fields = ('created_by',)


