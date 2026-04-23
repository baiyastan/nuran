"""Phase B tests — spent_at period validation + foreman ProjectAssignment scope."""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.budgeting.models import ExpenseCategory, MonthPeriod
from apps.finance.models import FinancePeriod
from apps.planning.models import ActualExpense, Expense, PlanItem, PlanPeriod
from apps.projects.models import Project, ProjectAssignment

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin-phB', email='admin-phB@test.com', password='pw', role='admin'
    )


@pytest.fixture
def foreman_a(db):
    return User.objects.create_user(
        username='fm-a', email='fm-a@test.com', password='pw', role='foreman'
    )


@pytest.fixture
def foreman_b(db):
    return User.objects.create_user(
        username='fm-b', email='fm-b@test.com', password='pw', role='foreman'
    )


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month='2026-04', status='OPEN', planning_open=True)


@pytest.fixture
def project_a(db, admin_user):
    return Project.objects.create(name='Proj A', status='active', created_by=admin_user)


@pytest.fixture
def project_b(db, admin_user):
    return Project.objects.create(name='Proj B', status='active', created_by=admin_user)


@pytest.fixture
def plan_period_a(db, project_a, month_period, admin_user):
    return PlanPeriod.objects.create(
        fund_kind='project', project=project_a, period='2026-04',
        month_period=month_period, status='draft', created_by=admin_user,
    )


@pytest.fixture
def finance_period_a(db, project_a, month_period, admin_user):
    return FinancePeriod.objects.create(
        project=project_a, month_period=month_period, fund_kind='project',
        created_by=admin_user,
    )


@pytest.fixture
def category_project(db):
    return ExpenseCategory.objects.create(
        name='Бетон', scope='project', kind='EXPENSE', is_active=True,
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestActualExpenseSpentAt:
    """per plan-fact-linking §3: spent_at must be inside finance_period.month_period.month."""

    def test_spent_at_in_period_accepted(self, admin_user, finance_period_a, category_project):
        ae = ActualExpense(
            finance_period=finance_period_a, category=category_project,
            name='bet', amount=Decimal('100'),
            spent_at=date(2026, 4, 15), comment='ok', created_by=admin_user,
        )
        ae.full_clean()  # no error

    def test_spent_at_wrong_month_rejected(self, admin_user, finance_period_a, category_project):
        ae = ActualExpense(
            finance_period=finance_period_a, category=category_project,
            name='bet', amount=Decimal('100'),
            spent_at=date(2026, 5, 1), comment='ok', created_by=admin_user,
        )
        with pytest.raises(ValidationError) as exc:
            ae.full_clean()
        assert 'spent_at' in exc.value.message_dict

    def test_spent_at_previous_month_rejected(self, admin_user, finance_period_a, category_project):
        ae = ActualExpense(
            finance_period=finance_period_a, category=category_project,
            name='bet', amount=Decimal('100'),
            spent_at=date(2026, 3, 31), comment='ok', created_by=admin_user,
        )
        with pytest.raises(ValidationError):
            ae.full_clean()


@pytest.mark.django_db
class TestExpenseSpentAtAndLink:
    """per plan-fact-linking §3 + §7: spent_at ∈ plan_period month; plan_item must belong to plan_period."""

    def test_spent_at_in_period_accepted(self, admin_user, plan_period_a, category_project):
        plan_item = PlanItem.objects.create(
            plan_period=plan_period_a, title='t', amount=Decimal('100'), created_by=admin_user,
        )
        e = Expense(
            plan_period=plan_period_a, plan_item=plan_item,
            spent_at=date(2026, 4, 10), category=category_project,
            amount=Decimal('50'), comment='ok', created_by=admin_user,
        )
        e.full_clean()

    def test_spent_at_wrong_month_rejected(self, admin_user, plan_period_a, category_project):
        plan_item = PlanItem.objects.create(
            plan_period=plan_period_a, title='t', amount=Decimal('100'), created_by=admin_user,
        )
        e = Expense(
            plan_period=plan_period_a, plan_item=plan_item,
            spent_at=date(2026, 5, 10), category=category_project,
            amount=Decimal('50'), comment='ok', created_by=admin_user,
        )
        with pytest.raises(ValidationError) as exc:
            e.full_clean()
        assert 'spent_at' in exc.value.message_dict

    def test_plan_item_belongs_to_other_period_rejected(
        self, admin_user, plan_period_a, project_b, month_period, category_project
    ):
        plan_period_b = PlanPeriod.objects.create(
            fund_kind='project', project=project_b, period='2026-04',
            month_period=month_period, status='draft', created_by=admin_user,
        )
        plan_item_b = PlanItem.objects.create(
            plan_period=plan_period_b, title='other', amount=Decimal('100'), created_by=admin_user,
        )
        e = Expense(
            plan_period=plan_period_a,  # project_a
            plan_item=plan_item_b,       # belongs to project_b → mismatch
            spent_at=date(2026, 4, 10), category=category_project,
            amount=Decimal('50'), comment='ok', created_by=admin_user,
        )
        with pytest.raises(ValidationError) as exc:
            e.full_clean()
        assert 'plan_item' in exc.value.message_dict


@pytest.mark.django_db
class TestForemanProjectAssignmentScope:
    """per planning-lifecycle §4: foreman sees only assigned projects."""

    def test_foreman_sees_only_assigned_projects(self, foreman_a, project_a, project_b):
        ProjectAssignment.objects.create(prorab=foreman_a, project=project_a)
        r = _client(foreman_a).get('/api/v1/prorab/projects/')
        assert r.status_code == 200
        body = r.json()
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        ids = [row['id'] for row in results]
        assert project_a.id in ids
        assert project_b.id not in ids

    def test_foreman_no_assignment_sees_empty(self, foreman_a, project_a):
        r = _client(foreman_a).get('/api/v1/prorab/projects/')
        assert r.status_code == 200
        body = r.json()
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        assert results == []

    def test_foreman_permission_gates_by_assignment(
        self, foreman_a, project_a, project_b, month_period, admin_user, category_project
    ):
        """Direct permission test on apps.planning.ActualExpensePermission._foreman_can_see_actual_expense."""
        from apps.planning.permissions import _foreman_can_see_actual_expense

        mp_b = MonthPeriod.objects.create(month='2026-05', status='OPEN', planning_open=True)
        ProjectAssignment.objects.create(prorab=foreman_a, project=project_a)
        fp_a = FinancePeriod.objects.create(
            project=project_a, month_period=month_period,
            fund_kind='project', created_by=admin_user,
        )
        fp_b = FinancePeriod.objects.create(
            project=project_b, month_period=mp_b,
            fund_kind='project', created_by=admin_user,
        )
        ae_a = ActualExpense.objects.create(
            finance_period=fp_a, category=category_project,
            name='x', amount=Decimal('10'), spent_at=date(2026, 4, 10),
            comment='ok', created_by=admin_user,
        )
        ae_b = ActualExpense.objects.create(
            finance_period=fp_b, category=category_project,
            name='y', amount=Decimal('10'), spent_at=date(2026, 5, 10),
            comment='ok', created_by=admin_user,
        )

        assert _foreman_can_see_actual_expense(foreman_a, ae_a) is True
        assert _foreman_can_see_actual_expense(foreman_a, ae_b) is False
