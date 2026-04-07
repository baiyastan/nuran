import pytest
from django.contrib.auth import get_user_model
from decimal import Decimal

from apps.budgeting.models import MonthPeriod
from apps.finance.models import FinancePeriod, IncomeSource
from apps.finance.services import IncomeEntryService
from apps.planning.models import PlanItem, PlanPeriod
from apps.planning.services import PlanItemService
from apps.projects.models import Project
from rest_framework.exceptions import PermissionDenied


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_planning_gate',
        email='admin_planning_gate@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='foreman_planning_gate',
        email='foreman_planning_gate@test.com',
        password='testpass123',
        role='foreman',
    )


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(
        name='Planning Gate Project',
        description='Planning gate checks',
        status='active',
        created_by=admin_user,
    )


@pytest.mark.django_db
def test_planning_blocked_when_planning_open_false(foreman_user, project):
    month_period = MonthPeriod.objects.create(month='2099-01', status='OPEN', planning_open=False)
    plan_period = PlanPeriod.objects.create(
        project=project,
        period='2099-01',
        fund_kind='project',
        status='draft',
        month_period=month_period,
        created_by=foreman_user,
    )

    with pytest.raises(PermissionDenied):
        PlanItemService.create(
            user=foreman_user,
            plan_period=plan_period,
            title='Blocked item',
            amount='100.00',
        )


@pytest.mark.django_db
def test_planning_allowed_when_planning_open_true(foreman_user, project):
    month_period = MonthPeriod.objects.create(month='2099-02', status='OPEN', planning_open=True)
    plan_period = PlanPeriod.objects.create(
        project=project,
        period='2099-02',
        fund_kind='project',
        status='draft',
        month_period=month_period,
        created_by=foreman_user,
    )

    item = PlanItemService.create(
        user=foreman_user,
        plan_period=plan_period,
        title='Allowed item',
        amount='100.00',
    )
    assert isinstance(item, PlanItem)
    assert item.plan_period_id == plan_period.id


@pytest.mark.django_db
def test_income_entry_still_allowed_when_planning_open_false(admin_user):
    month_period = MonthPeriod.objects.create(month='2099-03', status='OPEN', planning_open=False)
    finance_period = FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind='office',
        project=None,
        status='open',
        created_by=admin_user,
    )
    source = IncomeSource.objects.create(name='Planning Gate Source', is_active=True)

    entry = IncomeEntryService.create(
        user=admin_user,
        finance_period=finance_period,
        source=source,
        account='CASH',
        amount=Decimal('250.00'),
        received_at='2099-03-12',
        comment='Still allowed',
    )
    assert entry.id is not None
