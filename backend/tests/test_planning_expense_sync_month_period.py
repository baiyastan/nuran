"""
Tests for PlanningExpenseActualExpenseSyncService month period resolution.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.exceptions import PermissionDenied

from apps.projects.models import Project
from apps.planning.models import PlanPeriod, PlanItem, Expense
from apps.planning.services import PlanningExpenseActualExpenseSyncService
from apps.budgeting.models import MonthPeriod
from apps.finance.models import FinancePeriod
from apps.finance.constants import MONTH_REQUIRED_MSG


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(
        name='Test Project',
        description='Test project',
        status='active',
        created_by=admin_user,
    )


@pytest.mark.django_db
def test_resolve_finance_period_missing_monthperiod_raises_and_does_not_create_monthperiod(project, admin_user):
    """
    Planning sync for non-existent month should fail and must not create MonthPeriod.
    """
    period_value = '2099-11'
    assert MonthPeriod.objects.filter(month=period_value).count() == 0

    plan_period = PlanPeriod.objects.create(
        project=project,
        period=period_value,
        status='draft',
        created_by=admin_user,
        fund_kind='project',
    )
    plan_item = PlanItem.objects.create(
        plan_period=plan_period,
        title='Test Item',
        amount=1000.0,
        created_by=admin_user,
    )
    expense = Expense.objects.create(
        plan_period=plan_period,
        plan_item=plan_item,
        amount=1000,
        comment='Test',
        created_by=admin_user,
        spent_at='2099-11-01',
    )

    with pytest.raises(ValidationError) as exc:
        PlanningExpenseActualExpenseSyncService.resolve_finance_period(expense)

    assert MONTH_REQUIRED_MSG in str(exc.value)
    assert MonthPeriod.objects.filter(month=period_value).count() == 0


@pytest.mark.django_db
def test_resolve_finance_period_creates_open_financeperiod_for_open_month(project, admin_user):
    """Auto-created FinancePeriod should inherit 'open' status when MonthPeriod is OPEN."""
    month_period = MonthPeriod.objects.create(month='2099-10', status='OPEN')

    plan_period = PlanPeriod.objects.create(
        project=project,
        period='2099-10',
        status='draft',
        created_by=admin_user,
        fund_kind='project',
        month_period=month_period,
    )
    plan_item = PlanItem.objects.create(
        plan_period=plan_period,
        title='Test Item',
        amount=1000.0,
        created_by=admin_user,
    )
    expense = Expense.objects.create(
        plan_period=plan_period,
        plan_item=plan_item,
        amount=1000,
        comment='Test',
        created_by=admin_user,
        spent_at='2099-10-01',
    )

    assert FinancePeriod.objects.filter(month_period=month_period, fund_kind='project', project=project).count() == 0

    finance_period = PlanningExpenseActualExpenseSyncService.resolve_finance_period(expense)

    assert finance_period.month_period == month_period
    assert finance_period.status == 'open'


@pytest.mark.django_db
def test_resolve_finance_period_does_not_create_financeperiod_when_month_locked(project, admin_user):
    """LOCKED month must not get a new FinancePeriod via sync (posted-facts rules; no admin bypass)."""
    month_period = MonthPeriod.objects.create(month='2099-09', status='LOCKED')

    plan_period = PlanPeriod.objects.create(
        project=project,
        period='2099-09',
        status='draft',
        created_by=admin_user,
        fund_kind='project',
        month_period=month_period,
    )
    plan_item = PlanItem.objects.create(
        plan_period=plan_period,
        title='Test Item',
        amount=500.0,
        created_by=admin_user,
    )
    expense = Expense.objects.create(
        plan_period=plan_period,
        plan_item=plan_item,
        amount=500,
        comment='Test locked',
        created_by=admin_user,
        spent_at='2099-09-01',
    )

    assert FinancePeriod.objects.filter(month_period=month_period, fund_kind='project', project=project).count() == 0

    with pytest.raises(PermissionDenied):
        PlanningExpenseActualExpenseSyncService.resolve_finance_period(expense)

    assert FinancePeriod.objects.filter(month_period=month_period, fund_kind='project', project=project).count() == 0

