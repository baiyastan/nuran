"""
Tests for ActualExpense API RBAC (apps.expenses – month_period + scope).
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from decimal import Decimal
from apps.budgeting.models import MonthPeriod, ExpenseCategory
from apps.projects.models import Project, ProjectAssignment
from apps.expenses.models import ActualExpense

User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='testpass123',
        role='admin'
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='foreman',
        email='foreman@test.com',
        password='testpass123',
        role='foreman'
    )


@pytest.fixture
def project(db, admin_user):
    return Project.objects.create(
        name='Test Project',
        description='Test Description',
        status='active',
        created_by=admin_user
    )


@pytest.fixture
def project_assignment(db, project, foreman_user):
    return ProjectAssignment.objects.create(
        project=project,
        prorab=foreman_user
    )


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(
        month='2024-01',
        status='OPEN'
    )


@pytest.fixture
def category_office(db):
    return ExpenseCategory.objects.create(
        name='Office Cat',
        scope='office',
        kind='EXPENSE',
        parent=None,
        is_active=True,
    )


@pytest.fixture
def category_charity(db):
    return ExpenseCategory.objects.create(
        name='Charity Cat',
        scope='charity',
        kind='EXPENSE',
        parent=None,
        is_active=True,
    )


@pytest.fixture
def category_project(db):
    return ExpenseCategory.objects.create(
        name='Project Cat',
        scope='project',
        kind='EXPENSE',
        parent=None,
        is_active=True,
    )


class TestActualExpenseRBAC:
    """ActualExpense RBAC: foreman may only access scope=PROJECT; office/charity -> 403."""

    def test_foreman_cannot_see_charity_expenses(
        self, api_client, month_period, category_charity, category_project,
        foreman_user, admin_user, project_assignment
    ):
        """Foreman listing without scope=PROJECT gets 403. With scope=PROJECT sees only PROJECT."""
        charity_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='CHARITY',
            category=category_charity,
            account='CASH',
            amount=Decimal('1000.00'),
            spent_at='2024-01-15',
            comment='Charity comment',
            created_by=admin_user,
        )
        project_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=category_project,
            account='CASH',
            amount=Decimal('500.00'),
            spent_at='2024-01-15',
            comment='Project comment',
            created_by=admin_user,
        )
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        # Foreman must pass scope=PROJECT to list; without it -> 403
        response = client.get('/api/v1/actual-expenses/')
        assert response.status_code == 403

        # With scope=PROJECT only PROJECT-scoped items are in the list
        response = client.get('/api/v1/actual-expenses/?scope=PROJECT')
        assert response.status_code == 200
        expense_ids = [exp['id'] for exp in response.data['results']]
        assert project_expense.id in expense_ids
        assert charity_expense.id not in expense_ids

    def test_foreman_cannot_see_office_expenses(
        self, api_client, month_period, category_office, category_project,
        foreman_user, admin_user, project_assignment
    ):
        """Foreman listing with scope=PROJECT sees only PROJECT, not OFFICE."""
        office_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='OFFICE',
            category=category_office,
            account='CASH',
            amount=Decimal('2000.00'),
            spent_at='2024-01-15',
            comment='Office comment',
            created_by=admin_user,
        )
        project_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=category_project,
            account='CASH',
            amount=Decimal('500.00'),
            spent_at='2024-01-15',
            comment='Project comment',
            created_by=admin_user,
        )
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = client.get('/api/v1/actual-expenses/?scope=PROJECT')
        assert response.status_code == 200
        expense_ids = [exp['id'] for exp in response.data['results']]
        assert project_expense.id in expense_ids
        assert office_expense.id not in expense_ids

    def test_office_not_mixed_with_project(self, month_period, category_office, category_project, admin_user):
        """Office and PROJECT expenses are separate by scope."""
        office_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='OFFICE',
            category=category_office,
            account='CASH',
            amount=Decimal('1000.00'),
            spent_at='2024-01-15',
            comment='Office comment',
            created_by=admin_user,
        )
        project_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=category_project,
            account='CASH',
            amount=Decimal('500.00'),
            spent_at='2024-01-15',
            comment='Project comment',
            created_by=admin_user,
        )
        assert office_expense.scope == 'OFFICE'
        assert project_expense.scope == 'PROJECT'

    def test_foreman_can_see_project_expenses(
        self, api_client, month_period, category_project, foreman_user, admin_user, project_assignment
    ):
        """Foreman can list and retrieve PROJECT-scoped expenses."""
        assigned_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=category_project,
            account='CASH',
            amount=Decimal('1000.00'),
            spent_at='2024-01-15',
            comment='Expense created by admin',
            created_by=admin_user,
        )
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = client.get('/api/v1/actual-expenses/?scope=PROJECT')
        assert response.status_code == 200
        expense_ids = [exp['id'] for exp in response.data['results']]
        assert assigned_expense.id in expense_ids

        response = client.get(f'/api/v1/actual-expenses/{assigned_expense.id}/')
        assert response.status_code == 200
        assert response.data['id'] == assigned_expense.id
        assert response.data['amount'] == '1000.00'
        assert response.data['comment'] == 'Expense created by admin'

    def test_foreman_cannot_retrieve_office_expense(
        self, api_client, month_period, category_office, foreman_user, admin_user
    ):
        """Foreman gets 403 when retrieving an OFFICE-scoped expense."""
        office_expense = ActualExpense.objects.create(
            month_period=month_period,
            scope='OFFICE',
            category=category_office,
            account='CASH',
            amount=Decimal('2000.00'),
            spent_at='2024-01-15',
            comment='Office expense',
            created_by=admin_user,
        )
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = client.get(f'/api/v1/actual-expenses/{office_expense.id}/')
        assert response.status_code == 403

    def test_foreman_without_assignment_cannot_access_project_expenses(
        self, month_period, category_project, foreman_user, admin_user
    ):
        """Foreman must have at least one ProjectAssignment to use PROJECT expense reports APIs."""
        ActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=category_project,
            account='CASH',
            amount=Decimal('100.00'),
            spent_at='2024-01-15',
            comment='x',
            created_by=admin_user,
        )
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = client.get('/api/v1/actual-expenses/?scope=PROJECT')
        assert response.status_code == 403
