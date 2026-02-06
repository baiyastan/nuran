"""
Tests for BudgetPlan model and API.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APIClient
from apps.budgeting.models import BudgetPlan, ExpenseCategory, MonthPeriod
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
def root_category_office(db):
    """Create root category with office scope."""
    return ExpenseCategory.objects.create(
        name='Office',
        scope='office',
        parent=None,
        is_active=True
    )


@pytest.fixture
def root_category_project(db):
    """Create root category with project scope."""
    return ExpenseCategory.objects.create(
        name='Object',
        scope='project',
        parent=None,
        is_active=True
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
    
    def test_root_category_must_be_root(self, month_period, root_category_office, project):
        """Test that root_category must have parent=None."""
        # Create a subcategory
        subcategory = ExpenseCategory.objects.create(
            name='Subcategory',
            scope='office',
            parent=root_category_office,
            is_active=True
        )
        
        # Try to create BudgetPlan with subcategory as root_category
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=subcategory,
            scope='OFFICE',
            project=None
        )
        
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        
        assert 'root_category' in str(exc_info.value)
    
    def test_office_scope_project_must_be_null(self, month_period, root_category_office, project):
        """Test that project must be NULL when root_category.scope is 'office'."""
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=root_category_office,
            scope='OFFICE',
            project=project
        )
        
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        
        assert 'project' in str(exc_info.value)
    
    def test_project_scope_project_must_not_be_null(self, month_period, root_category_project):
        """Test that project is required when root_category.scope is 'project'."""
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=root_category_project,
            scope='PROJECT',
            project=None
        )
        
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        
        assert 'project' in str(exc_info.value)
    
    def test_scope_must_match_root_category_scope(self, month_period, root_category_office):
        """Test that scope must match root_category.scope."""
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=root_category_office,
            scope='PROJECT',  # Wrong scope
            project=None
        )
        
        with pytest.raises(ValidationError) as exc_info:
            budget_plan.full_clean()
        
        assert 'scope' in str(exc_info.value)
    
    def test_valid_budget_plan_office(self, month_period, root_category_office):
        """Test creating valid BudgetPlan for office scope."""
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=root_category_office,
            scope='OFFICE',
            project=None
        )
        budget_plan.full_clean()
        budget_plan.save()
        
        assert budget_plan.root_category == root_category_office
        assert budget_plan.scope == 'OFFICE'
        assert budget_plan.project is None
    
    def test_valid_budget_plan_project(self, month_period, root_category_project, project):
        """Test creating valid BudgetPlan for project scope."""
        budget_plan = BudgetPlan(
            period=month_period,
            root_category=root_category_project,
            scope='PROJECT',
            project=project
        )
        budget_plan.full_clean()
        budget_plan.save()
        
        assert budget_plan.root_category == root_category_project
        assert budget_plan.scope == 'PROJECT'
        assert budget_plan.project == project


class TestBudgetPlanAPI:
    """Test BudgetPlan API endpoints."""
    
    def test_create_budget_plan(self, api_client, month_period, root_category_office):
        """Test creating a BudgetPlan via API."""
        data = {
            'period': month_period.id,
            'root_category': root_category_office.id,
            'scope': 'OFFICE',
            'project': None
        }
        
        response = api_client.post('/api/budgets/budgets/', data, format='json')
        
        assert response.status_code == 201
        assert response.data['root_category'] == root_category_office.id
        assert response.data['scope'] == 'OFFICE'
    
    def test_get_or_create_budget_plan(self, api_client, month_period, root_category_office):
        """Test get-or-create behavior."""
        data = {
            'period': month_period.id,
            'root_category': root_category_office.id,
            'scope': 'OFFICE',
            'project': None
        }
        
        # First create
        response1 = api_client.post('/api/budgets/budgets/', data, format='json')
        assert response1.status_code == 201
        
        # Second create (should return existing)
        response2 = api_client.post('/api/budgets/budgets/', data, format='json')
        assert response2.status_code == 200
        assert response2.data['id'] == response1.data['id']
    
    def test_filter_by_month(self, api_client, month_period, root_category_office):
        """Test filtering BudgetPlan by month."""
        # Create BudgetPlan
        BudgetPlan.objects.create(
            period=month_period,
            root_category=root_category_office,
            scope='OFFICE',
            project=None
        )
        
        response = api_client.get('/api/budgets/budgets/?month=2024-01')
        
        assert response.status_code == 200
        assert len(response.data['results']) == 1
    
    def test_filter_by_root_category(self, api_client, month_period, root_category_office, root_category_project):
        """Test filtering BudgetPlan by root_category."""
        # Create BudgetPlans
        BudgetPlan.objects.create(
            period=month_period,
            root_category=root_category_office,
            scope='OFFICE',
            project=None
        )
        
        response = api_client.get(f'/api/budgets/budgets/?root_category={root_category_office.id}')
        
        assert response.status_code == 200
        assert len(response.data['results']) == 1
        assert response.data['results'][0]['root_category'] == root_category_office.id


