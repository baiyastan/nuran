"""Phase A validation tests — plan-fact-linking §2, planning-lifecycle §1."""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.budgeting.models import ExpenseCategory, MonthPeriod
from apps.finance.models import FinancePeriod
from apps.planning.models import PlanPeriod, PlanItem
from apps.planning.services import PlanPeriodService, ActualExpenseService
from apps.projects.models import Project

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin-phA', email='admin-phA@test.com', password='pw', role='admin'
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='fm-phA', email='fm-phA@test.com', password='pw', role='foreman'
    )


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month='2026-04', status='OPEN', planning_open=True)


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(name='Test', status='active', created_by=admin_user)


@pytest.fixture
def plan_period(db, project, month_period, admin_user):
    return PlanPeriod.objects.create(
        fund_kind='project', project=project, period='2026-04',
        month_period=month_period, status='draft', created_by=admin_user,
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
class TestPlanItemAmountValidation:
    """per plan-fact-linking §2: amount > 0 in PlanItemSerializer."""

    def test_zero_amount_rejected(self, admin_user, plan_period):
        r = _client(admin_user).post('/api/v1/plan-items/', {
            'plan_period': plan_period.id,
            'title': 'Test',
            'amount': '0',
        }, format='json')
        assert r.status_code == 400
        assert 'amount' in r.json()

    def test_negative_amount_rejected(self, admin_user, plan_period):
        r = _client(admin_user).post('/api/v1/plan-items/', {
            'plan_period': plan_period.id,
            'title': 'Test',
            'amount': '-1.00',
        }, format='json')
        assert r.status_code == 400
        assert 'amount' in r.json()

    def test_positive_amount_accepted(self, admin_user, plan_period):
        r = _client(admin_user).post('/api/v1/plan-items/', {
            'plan_period': plan_period.id,
            'title': 'Test',
            'amount': '100.00',
        }, format='json')
        assert r.status_code in (200, 201), r.content


@pytest.mark.django_db
class TestUnlockAudit:
    """per planning-lifecycle §1: unlock must write an AuditLog entry."""

    def test_unlock_writes_audit(self, admin_user, plan_period):
        plan_period.status = 'approved'
        plan_period.save()
        PlanPeriodService.lock(plan_period, admin_user)
        plan_period.refresh_from_db()
        assert plan_period.status == 'locked'

        entries_before = AuditLog.objects.filter(
            model_name='PlanPeriod', object_id=plan_period.id
        ).count()

        PlanPeriodService.unlock(plan_period, admin_user)
        plan_period.refresh_from_db()
        assert plan_period.status == 'draft'
        assert plan_period.locked_at is None

        entries_after = AuditLog.objects.filter(
            model_name='PlanPeriod', object_id=plan_period.id
        ).count()
        assert entries_after == entries_before + 1

        last = AuditLog.objects.filter(
            model_name='PlanPeriod', object_id=plan_period.id
        ).order_by('-timestamp').first()
        assert last.before['status'] == 'locked'
        assert last.after['status'] == 'draft'
        assert last.actor_id == admin_user.id

    def test_unlock_requires_admin(self, foreman_user, plan_period):
        plan_period.status = 'locked'
        plan_period.save()
        from django.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            PlanPeriodService.unlock(plan_period, foreman_user)

    def test_unlock_requires_locked_status(self, admin_user, plan_period):
        assert plan_period.status == 'draft'
        from django.core.exceptions import ValidationError
        with pytest.raises(ValidationError):
            PlanPeriodService.unlock(plan_period, admin_user)


@pytest.mark.django_db
class TestActualExpenseCategoryRequired:
    """per plan-fact-linking §6: no silent fallback to 'Башка'."""

    def test_missing_category_rejected(self, admin_user, project, month_period):
        finance_period = FinancePeriod.objects.create(
            project=project, month_period=month_period, fund_kind='project',
            created_by=admin_user,
        )
        from django.core.exceptions import ValidationError
        with pytest.raises(ValidationError) as exc:
            ActualExpenseService.create(
                user=admin_user,
                finance_period=finance_period,
                name='бетон',
                amount=Decimal('100.00'),
                spent_at='2026-04-15',
                comment='test',
                # no category
            )
        msg = str(exc.value)
        assert 'категори' in msg.lower() or 'Категори' in msg

    def test_with_category_accepted(self, admin_user, project, month_period):
        finance_period = FinancePeriod.objects.create(
            project=project, month_period=month_period, fund_kind='project',
            created_by=admin_user,
        )
        cat = ExpenseCategory.objects.create(
            name='Бетон', scope='project', kind='EXPENSE', is_active=True,
        )
        expense = ActualExpenseService.create(
            user=admin_user,
            finance_period=finance_period,
            category=cat,
            name='бетон',
            amount=Decimal('100.00'),
            spent_at='2026-04-15',
            comment='test',
        )
        assert expense.pk is not None
        assert expense.category_id == cat.id
