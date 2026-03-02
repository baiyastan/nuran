"""
Tests for foreman access to BudgetPlan and ExpenseCategory endpoints.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.budgeting.models import BudgetPlan, ExpenseCategory, MonthPeriod
from apps.projects.models import Project, ProjectAssignment

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
def foreman_user(db):
    return User.objects.create_user(
        username='foreman',
        email='foreman@test.com',
        password='testpass123',
        role='foreman',
    )


@pytest.fixture
def director_user(db):
    return User.objects.create_user(
        username='director',
        email='director@test.com',
        password='testpass123',
        role='director',
    )


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month='2024-01', status='OPEN')


@pytest.fixture
def project_a(db, admin_user):
    return Project.objects.create(
        name='Project A',
        description='Project A desc',
        status='active',
        created_by=admin_user,
    )


@pytest.fixture
def project_b(db, admin_user):
    return Project.objects.create(
        name='Project B',
        description='Project B desc',
        status='active',
        created_by=admin_user,
    )


@pytest.fixture
def foreman_assigned_to_project_a(foreman_user, project_a):
    return ProjectAssignment.objects.create(project=project_a, prorab=foreman_user)


@pytest.fixture
def project_plan(db, month_period):
    return BudgetPlan.objects.create(
        period=month_period,
        scope='PROJECT',
        project=None,
    )


@pytest.fixture
def office_plan(db, month_period):
    return BudgetPlan.objects.create(
        period=month_period,
        scope='OFFICE',
        project=None,
    )


@pytest.fixture
def charity_plan(db, month_period):
    return BudgetPlan.objects.create(
        period=month_period,
        scope='CHARITY',
        project=None,
    )


@pytest.fixture
def project_category(db):
    return ExpenseCategory.objects.create(
        name='Project Category',
        scope='project',
        kind='EXPENSE',
        is_active=True,
    )


@pytest.fixture
def office_category(db):
    return ExpenseCategory.objects.create(
        name='Office Category',
        scope='office',
        kind='EXPENSE',
        is_active=True,
    )


class TestForemanBudgetPlanAccess:
    """Foreman can access BudgetPlan only for scope=PROJECT when assigned."""

    def test_foreman_assigned_gets_project_budgets(
        self, foreman_user, foreman_assigned_to_project_a, project_plan, month_period
    ):
        """Foreman assigned to Project A: GET budgets?month=...&scope=PROJECT returns 200 and only PROJECT plans."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/budgets/?month={month_period.month}&scope=PROJECT'
        )
        assert response.status_code == 200
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        assert len(results) == 1
        assert results[0]['scope'] == 'PROJECT'

    def test_foreman_assigned_cannot_access_office_budgets(
        self, foreman_user, foreman_assigned_to_project_a, office_plan, month_period
    ):
        """Foreman cannot access OFFICE scope budgets (403)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/budgets/?month={month_period.month}&scope=OFFICE'
        )
        assert response.status_code == 403

    def test_foreman_assigned_cannot_access_charity_budgets(
        self, foreman_user, foreman_assigned_to_project_a, charity_plan, month_period
    ):
        """Foreman cannot access CHARITY scope budgets (403)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/budgets/?month={month_period.month}&scope=CHARITY'
        )
        assert response.status_code == 403

    def test_foreman_without_assignment_can_list_project_budgets(
        self, foreman_user, project_plan, month_period
    ):
        """Foreman without ProjectAssignment can list PROJECT budgets (no assignment required)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/budgets/?month={month_period.month}&scope=PROJECT'
        )
        assert response.status_code == 200

    def test_admin_unaffected(self, admin_user, project_plan, office_plan, month_period):
        """Admin can access all scopes."""
        client = APIClient()
        client.force_authenticate(user=admin_user)
        for scope in ('PROJECT', 'OFFICE', 'CHARITY'):
            response = client.get(
                f'/api/v1/budgets/budgets/?month={month_period.month}&scope={scope}'
            )
            assert response.status_code == 200

    def test_director_unaffected(self, director_user, project_plan, month_period):
        """Director can read PROJECT budgets."""
        client = APIClient()
        client.force_authenticate(user=director_user)
        response = client.get(
            f'/api/v1/budgets/budgets/?month={month_period.month}&scope=PROJECT'
        )
        assert response.status_code == 200

    def test_foreman_assigned_can_create_project_plan(
        self, foreman_user, foreman_assigned_to_project_a, month_period
    ):
        """Foreman assigned: can create PROJECT scope plan."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.post(
            '/api/v1/budgets/budgets/',
            {'period': month_period.id, 'scope': 'PROJECT', 'project': None},
            format='json',
        )
        assert response.status_code in (200, 201)
        assert response.data['scope'] == 'PROJECT'


class TestForemanExpenseCategoryAccess:
    """Foreman can list expense categories only for scope=project."""

    def test_foreman_assigned_gets_project_categories(
        self, foreman_user, foreman_assigned_to_project_a, project_category
    ):
        """Foreman: GET expense-categories?scope=project&is_active=true returns 200."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            '/api/v1/budgets/expense-categories/?scope=project&is_active=true&kind=EXPENSE'
        )
        assert response.status_code == 200
        results = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        assert len(results) >= 1
        assert all(c['scope'] == 'project' for c in results)

    def test_foreman_cannot_access_office_categories(
        self, foreman_user, foreman_assigned_to_project_a, office_category
    ):
        """Foreman cannot list scope=office categories (403)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            '/api/v1/budgets/expense-categories/?scope=office&is_active=true'
        )
        assert response.status_code == 403

    def test_foreman_cannot_access_charity_categories(
        self, foreman_user, foreman_assigned_to_project_a
    ):
        """Foreman cannot list scope=charity categories (403)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            '/api/v1/budgets/expense-categories/?scope=charity&is_active=true'
        )
        assert response.status_code == 403

    def test_foreman_can_retrieve_project_category(
        self, foreman_user, foreman_assigned_to_project_a, project_category
    ):
        """Foreman can retrieve a single project-scope category."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/expense-categories/{project_category.id}/'
        )
        assert response.status_code == 200
        assert response.data['scope'] == 'project'

    def test_foreman_cannot_retrieve_office_category(
        self, foreman_user, foreman_assigned_to_project_a, office_category
    ):
        """Foreman cannot retrieve office-scope category (403)."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.get(
            f'/api/v1/budgets/expense-categories/{office_category.id}/'
        )
        assert response.status_code == 403

    def test_foreman_cannot_write_categories(
        self, foreman_user, foreman_assigned_to_project_a
    ):
        """Foreman cannot create/update/delete categories."""
        client = APIClient()
        client.force_authenticate(user=foreman_user)
        response = client.post(
            '/api/v1/budgets/expense-categories/',
            {'name': 'New Cat', 'scope': 'project', 'kind': 'EXPENSE'},
            format='json',
        )
        assert response.status_code == 403

    def test_admin_unaffected_categories(self, admin_user, project_category, office_category):
        """Admin can access all category scopes."""
        client = APIClient()
        client.force_authenticate(user=admin_user)
        for scope in ('project', 'office', 'charity'):
            response = client.get(
                f'/api/v1/budgets/expense-categories/?scope={scope}&is_active=true'
            )
            assert response.status_code == 200
