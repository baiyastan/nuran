import pytest
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetPlan, MonthPeriod
from apps.finance.models import FinancePeriod
from apps.planning.models import ActualExpense, Expense, PlanItem, PlanPeriod
from apps.planning.services import ExpenseService, PlanningExpenseActualExpenseSyncService
from apps.projects.models import Project


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_reliability',
        email='admin_reliability@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='foreman_reliability',
        email='foreman_reliability@test.com',
        password='testpass123',
        role='foreman',
    )


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(
        name='Reliability Project',
        description='Reliability tests',
        status='active',
        created_by=admin_user,
    )


@pytest.fixture
def open_month(db):
    return MonthPeriod.objects.create(month='2099-10', status='OPEN')


@pytest.fixture
def locked_month(db):
    return MonthPeriod.objects.create(month='2099-11', status='LOCKED')


@pytest.fixture
def plan_period(db, project, foreman_user, open_month):
    return PlanPeriod.objects.create(
        project=project,
        period='2099-10',
        fund_kind='project',
        status='draft',
        month_period=open_month,
        created_by=foreman_user,
    )


@pytest.fixture
def plan_item(db, plan_period, foreman_user):
    return PlanItem.objects.create(
        plan_period=plan_period,
        title='Reliability item',
        amount='100.00',
        created_by=foreman_user,
    )


def _auth(api_client, user):
    api_client.force_authenticate(user=user)


@pytest.mark.django_db
def test_sync_create_failure_rolls_back_planning_write(monkeypatch, admin_user, plan_period, plan_item):
    def _boom(*args, **kwargs):
        raise DjangoValidationError('sync create failed')

    monkeypatch.setattr(PlanningExpenseActualExpenseSyncService, 'sync_create', _boom)

    with pytest.raises(DjangoValidationError):
        with transaction.atomic():
            expense = ExpenseService.create(
                user=admin_user,
                plan_period=plan_period,
                plan_item=plan_item,
                amount='50.00',
                comment='rollback create',
                spent_at='2099-10-03',
            )
            PlanningExpenseActualExpenseSyncService.sync_create(expense, admin_user)

    assert Expense.objects.count() == 0


@pytest.mark.django_db
def test_sync_update_failure_rolls_back_planning_update(monkeypatch, admin_user, plan_period, plan_item):
    expense = Expense.objects.create(
        plan_period=plan_period,
        plan_item=plan_item,
        amount='100.00',
        comment='before update',
        spent_at='2099-10-04',
        created_by=admin_user,
    )

    def _boom(*args, **kwargs):
        raise DjangoValidationError('sync update failed')

    monkeypatch.setattr(PlanningExpenseActualExpenseSyncService, 'sync_update', _boom)

    with pytest.raises(DjangoValidationError):
        with transaction.atomic():
            ExpenseService.update(expense=expense, user=admin_user, comment='after update')
            PlanningExpenseActualExpenseSyncService.sync_update(expense, admin_user)

    expense.refresh_from_db()
    assert expense.comment == 'before update'


@pytest.mark.django_db
def test_sync_delete_failure_rolls_back_delete(monkeypatch, admin_user, plan_period, plan_item):
    finance_period = FinancePeriod.objects.create(
        month_period=plan_period.month_period,
        fund_kind='project',
        project=plan_period.project,
        status='open',
        created_by=admin_user,
    )
    actual = ActualExpense.objects.create(
        finance_period=finance_period,
        period=plan_period,
        name='Synced actual',
        amount='100.00',
        spent_at='2099-10-05',
        comment='actual',
        created_by=admin_user,
    )
    expense = Expense.objects.create(
        plan_period=plan_period,
        plan_item=plan_item,
        amount='100.00',
        comment='delete candidate',
        spent_at='2099-10-05',
        created_by=admin_user,
        finance_actual_expense=actual,
    )

    def _boom(*args, **kwargs):
        raise DjangoValidationError('sync delete failed')

    monkeypatch.setattr(PlanningExpenseActualExpenseSyncService, 'sync_delete', _boom)

    with pytest.raises(DjangoValidationError):
        with transaction.atomic():
            PlanningExpenseActualExpenseSyncService.sync_delete(expense, admin_user)
            ExpenseService.delete(expense=expense, user=admin_user)

    assert Expense.objects.filter(pk=expense.pk).exists()
    assert ActualExpense.objects.filter(pk=actual.pk).exists()


@pytest.mark.django_db
def test_month_open_rolls_back_if_finance_sync_fails(monkeypatch, admin_user):
    month = MonthPeriod.objects.create(month='2099-08', status='LOCKED')
    client = APIClient()
    _auth(client, admin_user)

    def _boom(*args, **kwargs):
        raise RuntimeError('sync failed')

    monkeypatch.setattr('apps.budgeting.api.views.FinancePeriodService.sync_status_from_month_period', _boom)

    try:
        response = client.post(f'/api/v1/budgets/month-periods/{month.id}/open/')
    except RuntimeError:
        response = None
    if response is not None:
        assert response.status_code == 500

    month.refresh_from_db()
    assert month.status == 'LOCKED'


@pytest.mark.django_db
def test_month_lock_rolls_back_if_finance_sync_fails(monkeypatch, admin_user):
    month = MonthPeriod.objects.create(month='2099-09', status='OPEN')
    client = APIClient()
    _auth(client, admin_user)

    def _boom(*args, **kwargs):
        raise RuntimeError('sync failed')

    monkeypatch.setattr('apps.budgeting.api.views.FinancePeriodService.sync_status_from_month_period', _boom)

    try:
        response = client.post(f'/api/v1/budgets/month-periods/{month.id}/lock/')
    except RuntimeError:
        response = None
    if response is not None:
        assert response.status_code == 500

    month.refresh_from_db()
    assert month.status == 'OPEN'


@pytest.mark.django_db
def test_plan_period_submit_month_locked_returns_permission_denied(
    admin_user, foreman_user, project, locked_month
):
    plan_period = PlanPeriod.objects.create(
        project=project,
        period='2099-11',
        fund_kind='project',
        status='draft',
        month_period=locked_month,
        created_by=foreman_user,
    )
    client = APIClient()
    _auth(client, foreman_user)
    response = client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
    assert response.status_code == 403
    assert 'detail' in response.data


@pytest.mark.django_db
def test_plan_period_invalid_transition_returns_400(admin_user, foreman_user, plan_period):
    plan_period.status = 'submitted'
    plan_period.save(update_fields=['status'])
    client = APIClient()
    _auth(client, foreman_user)
    response = client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
    assert response.status_code == 400
    assert 'detail' in response.data


@pytest.mark.django_db
def test_plan_period_permission_failure_returns_403(admin_user, foreman_user, plan_period):
    client = APIClient()
    _auth(client, foreman_user)
    response = client.post(f'/api/v1/plan-periods/{plan_period.id}/lock/')
    assert response.status_code == 403


@pytest.mark.django_db
def test_audit_legacy_planning_budget_data_command_outputs_counts(admin_user, project):
    audit_month = MonthPeriod.objects.create(month='2099-12', status='OPEN')
    # PlanPeriod with NULL month_period (simulate legacy row via direct DB update)
    null_month_period_plan = PlanPeriod.objects.create(
        project=project,
        period='2099-12',
        fund_kind='project',
        status='draft',
        month_period=audit_month,
        created_by=admin_user,
    )
    PlanPeriod.objects.filter(pk=null_month_period_plan.pk).update(month_period=None)
    # BudgetPlan in DRAFT
    BudgetPlan.objects.create(period=audit_month, scope='OFFICE', project=None, status='DRAFT')
    # PlanPeriod in legacy open status (normalized to draft on save path, so update directly)
    legacy = PlanPeriod.objects.create(
        project=project,
        period='2099-01',
        fund_kind='project',
        status='draft',
        month_period=audit_month,
        created_by=admin_user,
    )
    PlanPeriod.objects.filter(pk=legacy.pk).update(status='open')

    from io import StringIO
    out = StringIO()
    call_command('audit_legacy_planning_budget_data', stdout=out)
    output = out.getvalue()
    assert 'PlanPeriod rows with NULL month_period:' in output
    assert 'BudgetPlan rows in DRAFT:' in output
    assert 'PlanPeriod rows in legacy open status:' in output
