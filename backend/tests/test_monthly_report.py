"""
Tests for monthly report endpoint.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from decimal import Decimal
from apps.budgeting.models import BudgetPlan, BudgetLine, ExpenseCategory, MonthPeriod
from apps.planning.models import ActualExpense, PlanPeriod, ProrabPlan, ProrabPlanItem
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
def subcategory_office(db, root_category_office):
    """Create subcategory under office root."""
    return ExpenseCategory.objects.create(
        name='Office Supplies',
        scope='office',
        parent=root_category_office,
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
def subcategory_project(db, root_category_project):
    """Create subcategory under project root."""
    return ExpenseCategory.objects.create(
        name='Materials',
        scope='project',
        parent=root_category_project,
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


@pytest.fixture
def budget_plan_office(db, month_period, root_category_office):
    """Create BudgetPlan for office."""
    return BudgetPlan.objects.create(
        period=month_period,
        root_category=root_category_office,
        scope='OFFICE',
        project=None
    )


@pytest.fixture
def budget_plan_project(db, month_period, root_category_project, project):
    """Create BudgetPlan for project."""
    return BudgetPlan.objects.create(
        period=month_period,
        root_category=root_category_project,
        scope='PROJECT',
        project=project
    )


class TestMonthlyReportAPI:
    """Test monthly report API endpoint."""
    
    def test_monthly_report_requires_month(self, api_client):
        """Test that month parameter is required."""
        response = api_client.get('/api/reports/monthly/')
        
        assert response.status_code == 400
        assert 'month' in response.data['error'].lower()
    
    def test_monthly_report_invalid_format(self, api_client):
        """Test that month must be in YYYY-MM format."""
        response = api_client.get('/api/reports/monthly/?month=2024/01')
        
        assert response.status_code == 400
        assert 'format' in response.data['error'].lower()
    
    def test_monthly_report_empty_data(self, api_client):
        """Test monthly report with no data."""
        response = api_client.get('/api/reports/monthly/?month=2024-01')
        
        assert response.status_code == 200
        assert response.data['month'] == '2024-01'
        assert response.data['rows'] == []
        assert response.data['totals']['planned'] == 0.0
        assert response.data['totals']['actual'] == 0.0
    
    def test_monthly_report_with_budget_lines(self, api_client, budget_plan_office, subcategory_office):
        """Test monthly report aggregates planned from BudgetLine."""
        # Create BudgetLine
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        response = api_client.get('/api/reports/monthly/?month=2024-01')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_office.id
        assert response.data['rows'][0]['planned'] == 1000.0
        assert response.data['rows'][0]['actual'] == 0.0
        assert response.data['totals']['planned'] == 1000.0
    
    def test_monthly_report_with_actual_expenses(self, api_client, project, subcategory_office, admin_user):
        """Test monthly report aggregates actual from ActualExpense."""
        # Create ActualExpense
        ActualExpense.objects.create(
            project=project,
            category=subcategory_office,
            name='Test Expense',
            amount=Decimal('500.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get('/api/reports/monthly/?month=2024-01')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_office.id
        assert response.data['rows'][0]['planned'] == 0.0
        assert response.data['rows'][0]['actual'] == 500.0
        assert response.data['totals']['actual'] == 500.0
    
    def test_monthly_report_calculates_delta_and_percent(self, api_client, budget_plan_office, subcategory_office, project, admin_user):
        """Test monthly report calculates delta and percent correctly."""
        # Create BudgetLine
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        # Create ActualExpense
        ActualExpense.objects.create(
            project=project,
            category=subcategory_office,
            name='Test Expense',
            amount=Decimal('750.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get('/api/reports/monthly/?month=2024-01')
        
        assert response.status_code == 200
        row = response.data['rows'][0]
        assert row['planned'] == 1000.0
        assert row['actual'] == 750.0
        assert row['delta'] == -250.0
        assert row['percent'] == -25.0  # -250 / 1000 * 100
    
    def test_monthly_report_filter_by_project(self, api_client, budget_plan_project, subcategory_project, project, admin_user):
        """Test filtering monthly report by project."""
        # Create BudgetLine
        BudgetLine.objects.create(
            plan=budget_plan_project,
            category=subcategory_project,
            amount_planned=Decimal('2000.00')
        )
        
        # Create ActualExpense for this project
        ActualExpense.objects.create(
            project=project,
            category=subcategory_project,
            name='Test Expense',
            amount=Decimal('1500.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get(f'/api/reports/monthly/?month=2024-01&project={project.id}')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_project.id
        assert response.data['project_id'] == project.id
    
    def test_monthly_report_filter_by_root_category(self, api_client, budget_plan_office, subcategory_office, root_category_office):
        """Test filtering monthly report by root_category."""
        # Create BudgetLine
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        response = api_client.get(f'/api/reports/monthly/?month=2024-01&root_category={root_category_office.id}')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['root_category_id'] == root_category_office.id
    
    def test_monthly_report_with_prorab_plan_items(self, api_client, month_period, project, admin_user, subcategory_project):
        """Test monthly report includes ProrabPlanItem planned amounts when project filter is used."""
        # Create PlanPeriod
        plan_period = PlanPeriod.objects.create(
            project=project,
            period='2024-01',
            status='open',
            created_by=admin_user
        )
        
        # Create ProrabPlan
        prorab_plan = ProrabPlan.objects.create(
            period=plan_period,
            prorab=admin_user,
            status='approved'
        )
        
        # Create ProrabPlanItem
        ProrabPlanItem.objects.create(
            plan=prorab_plan,
            category=subcategory_project,
            name='Test Material',
            amount=Decimal('500.00'),
            created_by=admin_user
        )
        
        response = api_client.get(f'/api/reports/monthly/?month=2024-01&project={project.id}')
        
        assert response.status_code == 200
        # Should include planned from ProrabPlanItem
        # Note: This test may need adjustment based on actual implementation
        assert response.data['totals']['planned'] >= 500.0


