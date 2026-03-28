"""Report cache invalidation (dashboard KPI + monthly) after relevant writes."""
from decimal import Decimal

import pytest
from django.core.cache import cache
from django.test import override_settings
from apps.budgeting.models import MonthPeriod
from apps.reports.cache import dashboard_kpi_cache_key, monthly_report_cache_key
from apps.reports.invalidation import (
    invalidate_all_dashboard_kpi_caches,
    invalidate_dashboard_kpi_for_month_period,
    invalidate_for_budget_plan,
    invalidate_monthly_report_for_scope,
)

TEST_CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'reports-invalidation-tests',
    }
}


@pytest.fixture
def report_cache_enabled():
    with override_settings(CACHES=TEST_CACHES, REPORTS_CACHE_ENABLED=True):
        cache.clear()
        yield
        cache.clear()


@pytest.mark.django_db
class TestReportCacheInvalidationHelpers:
    def test_invalidate_dashboard_kpi_for_month_period_deletes_key(self, report_cache_enabled):
        cache.clear()
        mp = MonthPeriod.objects.create(month='2099-02', status='OPEN')
        key = dashboard_kpi_cache_key(mp.month, mp.pk)
        cache.set(key, {'x': 1}, timeout=300)
        assert cache.get(key) is not None
        invalidate_dashboard_kpi_for_month_period(mp)
        assert cache.get(key) is None

    def test_invalidate_monthly_report_for_scope_deletes_key(self, report_cache_enabled):
        cache.clear()
        mp = MonthPeriod.objects.create(month='2099-03', status='OPEN')
        key = monthly_report_cache_key(mp.month, 'OFFICE', mp.pk)
        cache.set(key, {'x': 1}, timeout=300)
        invalidate_monthly_report_for_scope(mp, 'OFFICE')
        assert cache.get(key) is None

    def test_invalidate_all_dashboard_kpi_caches(self, report_cache_enabled):
        cache.clear()
        m1 = MonthPeriod.objects.create(month='2099-04', status='OPEN')
        m2 = MonthPeriod.objects.create(month='2099-05', status='OPEN')
        k1 = dashboard_kpi_cache_key(m1.month, m1.pk)
        k2 = dashboard_kpi_cache_key(m2.month, m2.pk)
        cache.set(k1, {}, timeout=300)
        cache.set(k2, {}, timeout=300)
        invalidate_all_dashboard_kpi_caches()
        assert cache.get(k1) is None and cache.get(k2) is None


@pytest.mark.django_db
def test_budget_plan_invalidate_clears_kpi_and_monthly_keys(report_cache_enabled):
    from apps.budgeting.models import BudgetPlan

    cache.clear()
    mp = MonthPeriod.objects.create(month='2099-06', status='OPEN')
    plan = BudgetPlan.objects.create(period=mp, scope='PROJECT', status='OPEN')
    kpi_key = dashboard_kpi_cache_key(mp.month, mp.pk)
    mon_key = monthly_report_cache_key(mp.month, 'PROJECT', mp.pk)
    cache.set(kpi_key, {}, timeout=300)
    cache.set(mon_key, {}, timeout=300)
    invalidate_for_budget_plan(plan)
    assert cache.get(kpi_key) is None
    assert cache.get(mon_key) is None


@pytest.mark.django_db
def test_income_entry_create_invalidates_dashboard_kpi_cache(
    report_cache_enabled, finance_period_office, income_source_fixture
):
    """Income entries affect cumulative balances in KPI — all month KPI keys are cleared."""
    from apps.finance.services import IncomeEntryService

    cache.clear()
    mp2 = MonthPeriod.objects.create(month='2099-09', status='OPEN')
    k_other = dashboard_kpi_cache_key(mp2.month, mp2.pk)
    cache.set(k_other, {'cached': True}, timeout=300)

    IncomeEntryService.create(
        finance_period_office.created_by,
        finance_period=finance_period_office,
        source=income_source_fixture,
        account='CASH',
        amount=Decimal('10.00'),
        received_at='2099-08-15',
        comment='inv test',
    )
    assert cache.get(k_other) is None


@pytest.fixture
def finance_period_office(django_user_model, month_period_aug):
    from apps.finance.models import FinancePeriod

    admin = django_user_model.objects.create_user(
        username='admin_inv',
        email='a@test.com',
        password='x',
        role='admin',
    )
    return FinancePeriod.objects.create(
        month_period=month_period_aug,
        fund_kind='office',
        project=None,
        created_by=admin,
    )


@pytest.fixture
def income_source_fixture(db):
    from apps.finance.models import IncomeSource

    return IncomeSource.objects.create(name='InvTest Source', is_active=True)


@pytest.fixture
def month_period_aug(db):
    return MonthPeriod.objects.create(month='2099-08', status='OPEN')
