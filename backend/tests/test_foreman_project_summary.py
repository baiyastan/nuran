"""
Tests for GET /api/v1/foreman/project-summary/ (ForemanProjectSummaryView).

BudgetPlan is one row per (period, scope) with project=NULL; PROJECT-scope totals
are not split per project. Response exposes one summary + assigned_projects only.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetPlan, BudgetLine, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.projects.models import Project, ProjectAssignment

User = get_user_model()

FOREMAN_SUMMARY_URL = '/api/v1/foreman/project-summary/'


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_fs',
        email='admin_fs@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='foreman_fs',
        email='foreman_fs@test.com',
        password='testpass123',
        role='foreman',
    )


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month='2024-06', status='OPEN')


@pytest.fixture
def root_category_project(db):
    return ExpenseCategory.objects.create(
        name='ProjectRoot',
        scope='project',
        parent=None,
        is_active=True,
        kind='EXPENSE',
    )


@pytest.fixture
def leaf_category_project(db, root_category_project):
    return ExpenseCategory.objects.create(
        name='Materials',
        scope='project',
        parent=root_category_project,
        is_active=True,
        kind='EXPENSE',
    )


@pytest.fixture
def leaf_category_project_b(db, root_category_project):
    return ExpenseCategory.objects.create(
        name='Labor',
        scope='project',
        parent=root_category_project,
        is_active=True,
        kind='EXPENSE',
    )


@pytest.fixture
def project_alpha(db, admin_user):
    return Project.objects.create(
        name='Alpha',
        description='',
        status='active',
        created_by=admin_user,
    )


@pytest.fixture
def project_beta(db, admin_user):
    return Project.objects.create(
        name='Beta',
        description='',
        status='active',
        created_by=admin_user,
    )


@pytest.fixture
def foreman_client(foreman_user):
    c = APIClient()
    c.force_authenticate(user=foreman_user)
    return c


class TestForemanProjectSummaryView:
    def test_requires_month(self, foreman_user, project_alpha, month_period):
        ProjectAssignment.objects.create(project=project_alpha, prorab=foreman_user)
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        r = client.get(FOREMAN_SUMMARY_URL)
        assert r.status_code == 400
        assert 'month' in r.data

    def test_foreman_without_assignment_gets_summary_and_empty_assignments(
        self, foreman_user, month_period
    ):
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        r = client.get(f'{FOREMAN_SUMMARY_URL}?month=2024-06')
        assert r.status_code == 200
        assert r.data['data']['assigned_projects'] == []

    def test_non_foreman_forbidden(self, admin_user, month_period):
        client = APIClient()
        client.force_authenticate(user=admin_user)
        r = client.get(f'{FOREMAN_SUMMARY_URL}?month=2024-06')
        assert r.status_code == 403

    def test_summary_totals_once_no_per_project_financials(
        self,
        foreman_client,
        foreman_user,
        month_period,
        project_alpha,
        project_beta,
        leaf_category_project,
        leaf_category_project_b,
    ):
        ProjectAssignment.objects.create(project=project_alpha, prorab=foreman_user)
        ProjectAssignment.objects.create(project=project_beta, prorab=foreman_user)

        project_plan = BudgetPlan.objects.create(
            period=month_period,
            scope='PROJECT',
            project=None,
        )
        BudgetLine.objects.create(
            plan=project_plan,
            category=leaf_category_project,
            amount_planned=Decimal('1000.00'),
        )
        BudgetLine.objects.create(
            plan=project_plan,
            category=leaf_category_project_b,
            amount_planned=Decimal('500.00'),
        )

        ExpenseActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=None,
            account='CASH',
            amount=Decimal('300.00'),
            spent_at='2024-06-10',
            comment='x',
            created_by=foreman_user,
        )

        r = foreman_client.get(f'{FOREMAN_SUMMARY_URL}?month=2024-06')
        assert r.status_code == 200
        data = r.data['data']
        assert data['month'] == '2024-06'

        summary = data['summary']
        assert Decimal(summary['planned_total']) == Decimal('1500.00')
        assert Decimal(summary['actual_total']) == Decimal('300.00')
        assert Decimal(summary['difference']) == Decimal('1200.00')

        assigned = data['assigned_projects']
        assert len(assigned) == 2
        ids = {p['project_id'] for p in assigned}
        assert ids == {project_alpha.id, project_beta.id}
        for p in assigned:
            assert set(p.keys()) == {'project_id', 'project_name'}
            assert 'planned_total' not in p
            assert 'actual_total' not in p
            assert 'difference' not in p

    def test_assigned_projects_only_lists_user_assignments(
        self,
        foreman_client,
        foreman_user,
        admin_user,
        month_period,
        project_alpha,
        project_beta,
        leaf_category_project,
    ):
        ProjectAssignment.objects.create(project=project_alpha, prorab=foreman_user)

        other_foreman = User.objects.create_user(
            username='other_f',
            email='other_f@test.com',
            password='testpass123',
            role='foreman',
        )
        ProjectAssignment.objects.create(project=project_beta, prorab=other_foreman)

        plan = BudgetPlan.objects.create(period=month_period, scope='PROJECT', project=None)
        BudgetLine.objects.create(
            plan=plan,
            category=leaf_category_project,
            amount_planned=Decimal('100.00'),
        )

        r = foreman_client.get(f'{FOREMAN_SUMMARY_URL}?month=2024-06')
        assert r.status_code == 200
        assigned = r.data['data']['assigned_projects']
        assert len(assigned) == 1
        assert assigned[0]['project_id'] == project_alpha.id

    def test_planned_total_matches_project_scope_lines_not_per_project_filter(
        self,
        foreman_client,
        foreman_user,
        month_period,
        project_alpha,
        leaf_category_project,
    ):
        """
        Regression: old code used plan__project_id=project.id; BudgetPlan.project is
        always NULL, so planned was always 0. With correct filter, lines count.
        """
        ProjectAssignment.objects.create(project=project_alpha, prorab=foreman_user)

        project_plan = BudgetPlan.objects.create(
            period=month_period,
            scope='PROJECT',
            project=None,
        )
        BudgetLine.objects.create(
            plan=project_plan,
            category=leaf_category_project,
            amount_planned=Decimal('250.00'),
        )

        r = foreman_client.get(f'{FOREMAN_SUMMARY_URL}?month=2024-06')
        assert r.status_code == 200
        assert Decimal(r.data['data']['summary']['planned_total']) == Decimal('250.00')
