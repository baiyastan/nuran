"""
Explicit invalidation for report caches (dashboard KPI + monthly plan vs fact).

See module docstring on each public function for which write paths call it.
"""
from __future__ import annotations

from django.core.cache import cache

from apps.reports.cache import dashboard_kpi_cache_key, monthly_report_cache_key


def invalidate_dashboard_kpi_for_month_period(month_period) -> None:
    """Drop cached KPI for one MonthPeriod (income/expense plan totals, same-period facts, planning actuals)."""
    if not month_period:
        return
    cache.delete(dashboard_kpi_cache_key(month_period.month, month_period.pk))


def invalidate_all_dashboard_kpi_caches() -> None:
    """
    Drop every dashboard KPI cache entry.

    Used when posted facts affect cumulative cash/bank balances (get_balance_for_account),
    which appear in every month's KPI via opening/closing and inflows/outflows by date.
    """
    from apps.budgeting.models import MonthPeriod

    for month, mp_id in MonthPeriod.objects.values_list('month', 'id'):
        cache.delete(dashboard_kpi_cache_key(month, mp_id))


_MONTHLY_CACHE_CURRENCY_VARIANTS = (None, 'KGS', 'USD')


def invalidate_monthly_report_for_scope(month_period, scope: str | None) -> None:
    """Drop cached monthly report for one (month_period, scope) across every currency variant."""
    if not month_period or not scope:
        return
    for currency in _MONTHLY_CACHE_CURRENCY_VARIANTS:
        cache.delete(monthly_report_cache_key(month_period.month, scope, month_period.pk, currency))


def invalidate_monthly_report_all_scopes(month_period) -> None:
    """Drop cached monthly reports for OFFICE, PROJECT, CHARITY for this period (all currency variants)."""
    if not month_period:
        return
    for scope in ('OFFICE', 'PROJECT', 'CHARITY'):
        for currency in _MONTHLY_CACHE_CURRENCY_VARIANTS:
            cache.delete(monthly_report_cache_key(month_period.month, scope, month_period.pk, currency))


def invalidate_for_budget_plan(plan) -> None:
    """
    Budget lines / plan identity affect KPI expense_plan and monthly rows for that scope.
    """
    if not plan:
        return
    invalidate_dashboard_kpi_for_month_period(plan.period)
    invalidate_monthly_report_for_scope(plan.period, plan.scope)


def invalidate_for_expense_actual_write(
    *,
    invalidate_monthly_pairs: list,
) -> None:
    """
    Posted ActualExpense (apps.expenses): affects all KPI balance fields + listed monthly scopes.

    Pass (month_period, scope) pairs to clear (e.g. old + new on update).
    """
    invalidate_all_dashboard_kpi_caches()
    seen: set[tuple[int, str]] = set()
    for mp, scope in invalidate_monthly_pairs:
        if not mp or not scope:
            continue
        key = (mp.pk, scope)
        if key in seen:
            continue
        seen.add(key)
        invalidate_monthly_report_for_scope(mp, scope)
