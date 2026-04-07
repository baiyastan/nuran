"""
Tests for BudgetPlan model and API.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from apps.budgeting.models import BudgetPlan, BudgetLine, ExpenseCategory, MonthPeriod
from apps.projects.models import Project

User = get_user_model()


@pytest.fixture
def admin_user(db):
    """Create admin user."""
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='testpass123',
        role='admin'
    )


@pytest.fixture
def month_period(db):
    """Create month period."""
    return MonthPeriod.objects.create(
        month='2024-01',
        status='OPEN'
    )


@pytest.fixture
def project(db, admin_user):
    """Create project."""
    return Project.objects.create(
        name='Test Project',
        description='Test description',
        status='active',
        created_by=admin_user
    )


@pytest.fixture
def api_client(admin_user):
    """Create API client with admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


class TestBudgetPlanModel:
    """Test BudgetPlan model validations."""

    def test_office_scope_project_must_be_null(self, month_period, project):
        """Test that project must be NULL when scope is OFFICE."""
        budget_plan = BudgetPlan(
            period=month_period,
            scope='OFFICE',
            project=project
        )
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        assert 'project' in str(exc_info.value)

    def test_charity_scope_project_must_be_null(self, month_period, project):
        """Test that project must be NULL when scope is CHARITY."""
        budget_plan = BudgetPlan(
            period=month_period,
            scope='CHARITY',
            project=project
        )
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        assert 'project' in str(exc_info.value)

    def test_project_scope_project_must_be_null(self, month_period, project):
        """Test that project must be NULL when scope is PROJECT."""
        budget_plan = BudgetPlan(
            period=month_period,
            scope='PROJECT',
            project=project
        )
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        assert 'project' in str(exc_info.value)

    def test_valid_budget_plan_office(self, month_period):
        """Test creating valid BudgetPlan for OFFICE scope."""
        budget_plan = BudgetPlan(
            period=month_period,
            scope='OFFICE',
            project=None
        )
        budget_plan.full_clean()
        budget_plan.save()
        assert budget_plan.scope == 'OFFICE'
        assert budget_plan.project is None

    def test_valid_budget_plan_project(self, month_period):
        """Test creating valid BudgetPlan for PROJECT scope (project must be null)."""
        budget_plan = BudgetPlan(
            period=month_period,
            scope='PROJECT',
            project=None
        )
        budget_plan.full_clean()
        budget_plan.save()
        assert budget_plan.scope == 'PROJECT'
        assert budget_plan.project is None


class TestBudgetPlanAPI:
    """Test BudgetPlan API endpoints."""

    def test_create_budget_plan(self, api_client, month_period):
        """Test creating a BudgetPlan via API."""
        data = {
            'period': month_period.id,
            'scope': 'OFFICE',
            'project': None
        }
        response = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response.status_code == 201
        assert response.data['scope'] == 'OFFICE'
        assert response.data['status'] == 'OPEN'

    def test_get_or_create_budget_plan(self, api_client, month_period):
        """Test get-or-create behavior."""
        data = {
            'period': month_period.id,
            'scope': 'OFFICE',
            'project': None
        }
        response1 = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response1.status_code == 201
        response2 = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response2.status_code == 200
        assert response2.data['id'] == response1.data['id']

    def test_filter_by_month(self, api_client, month_period):
        """Test filtering BudgetPlan by month."""
        BudgetPlan.objects.create(
            period=month_period,
            scope='OFFICE',
            project=None
        )
        response = api_client.get('/api/v1/budgets/budgets/?month=2024-01')
        assert response.status_code == 200
        assert len(response.data['results']) == 1

    def test_filter_by_scope(self, api_client, month_period):
        """Test filtering BudgetPlan by scope."""
        BudgetPlan.objects.create(
            period=month_period,
            scope='OFFICE',
            project=None
        )
        BudgetPlan.objects.create(
            period=month_period,
            scope='PROJECT',
            project=None
        )
        response = api_client.get('/api/v1/budgets/budgets/?scope=OFFICE')
        assert response.status_code == 200
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['scope'] == 'OFFICE'

    def test_filter_by_month_and_scope_returns_only_matching_scope(self, api_client, month_period):
        """List with month+scope returns only the plan for that scope (Plan Setup page)."""
        BudgetPlan.objects.create(
            period=month_period,
            scope='OFFICE',
            project=None,
        )
        BudgetPlan.objects.create(
            period=month_period,
            scope='PROJECT',
            project=None,
        )
        BudgetPlan.objects.create(
            period=month_period,
            scope='CHARITY',
            project=None,
        )
        for scope in ('OFFICE', 'PROJECT', 'CHARITY'):
            response = api_client.get(
                f'/api/v1/budgets/budgets/?month={month_period.month}&scope={scope}'
            )
            assert response.status_code == 200, f'scope={scope}'
            results = response.data['results']
            assert len(results) == 1, f'scope={scope}: expected 1 result, got {len(results)}'
            assert results[0]['scope'] == scope, f'scope={scope}: got {results[0]["scope"]}'

    def test_create_budget_plan_missing_month_period_string_returns_400(self, api_client):
        """Creating BudgetPlan with non-existent month string should return 400, not 403."""
        data = {
            'period': '2099-12',
            'scope': 'OFFICE',
            'project': None,
        }
        response = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response.status_code == 400
        assert 'period' in response.data
        assert 'month period does not exist' in str(response.data['period'][0]).lower()

    def test_filter_by_month_invalid_format_returns_400(self, api_client):
        """Filtering by invalid month format should return 400."""
        response = api_client.get('/api/v1/budgets/budgets/?month=2024/01')
        assert response.status_code == 400
        assert 'month' in response.data

    def test_project_scope_requires_project_in_api(self, api_client, month_period):
        """PROJECT scope via API must reject non-null project."""
        data = {
            'period': month_period.id,
            'scope': 'PROJECT',
            'project': 123,  # any non-null value should be rejected
        }
        response = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response.status_code == 400
        assert 'project' in response.data

    def test_project_scope_allows_null_project_and_reuses_existing_plan(self, api_client, month_period):
        """PROJECT scope via API allows null project and uses (period, scope) identity."""
        data = {
            'period': month_period.id,
            'scope': 'PROJECT',
            'project': None,
        }
        response = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response.status_code == 201
        first_id = response.data['id']
        assert response.data['scope'] == 'PROJECT'
        assert response.data['project'] is None

        # Second call with same (period, scope) should reuse existing plan, ignoring project field
        response2 = api_client.post('/api/v1/budgets/budgets/', data, format='json')
        assert response2.status_code == 200
        assert response2.data['id'] == first_id

    def test_budget_line_creation_works_for_open_plan(self, api_client, month_period):
        plan = BudgetPlan.objects.create(period=month_period, scope='OFFICE', project=None, status='OPEN')
        category = ExpenseCategory.objects.create(
            name='Office leaf',
            scope='office',
            kind='EXPENSE',
            parent=None,
            is_active=True,
        )
        response = api_client.post(
            '/api/v1/budgets/budget-lines/',
            {
                'plan': plan.id,
                'category': category.id,
                'amount_planned': '500.00',
                'note': 'Open plan line',
            },
            format='json',
        )
        assert response.status_code == 201
        assert BudgetLine.objects.filter(plan=plan, category=category).exists()

    @pytest.mark.parametrize('status_value', ['SUBMITTED', 'APPROVED'])
    def test_budget_line_creation_fails_for_non_open_plan(self, api_client, month_period, status_value):
        plan = BudgetPlan.objects.create(period=month_period, scope='OFFICE', project=None, status=status_value)
        category = ExpenseCategory.objects.create(
            name=f'Office leaf {status_value}',
            scope='office',
            kind='EXPENSE',
            parent=None,
            is_active=True,
        )
        response = api_client.post(
            '/api/v1/budgets/budget-lines/',
            {
                'plan': plan.id,
                'category': category.id,
                'amount_planned': '500.00',
                'note': 'Should fail',
            },
            format='json',
        )
        assert response.status_code == 400
        assert 'plan status must be open' in str(response.data).lower()
