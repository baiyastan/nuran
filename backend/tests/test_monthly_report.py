"""
Tests for monthly report endpoint.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from decimal import Decimal
from apps.budgeting.models import BudgetPlan, BudgetLine, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.projects.models import Project
from apps.finance.models import FinancePeriod
from apps.finance.constants import MONTH_REQUIRED_MSG

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
def budget_plan_office(db, month_period):
    """Create BudgetPlan for office."""
    return BudgetPlan.objects.create(
        period=month_period,
        scope='OFFICE',
        project=None
    )


@pytest.fixture
def budget_plan_project(db, month_period):
    """Create BudgetPlan for PROJECT scope (project optional)."""
    return BudgetPlan.objects.create(
        period=month_period,
        scope='PROJECT',
        project=None
    )


@pytest.fixture
def finance_period_office(db, month_period, admin_user):
    """Create FinancePeriod for office."""
    return FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind='office',
        project=None,
        created_by=admin_user
    )


@pytest.fixture
def finance_period_project(db, month_period, project, admin_user):
    """Create FinancePeriod for project."""
    return FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind='project',
        project=project,
        created_by=admin_user
    )


class TestMonthlyReportAPI:
    """Test monthly report API endpoint."""
    
    def test_monthly_report_requires_month(self, api_client):
        """Test that month parameter is required."""
        response = api_client.get('/api/v1/reports/monthly/?scope=OFFICE')
        assert response.status_code == 400
        assert 'month' in response.data
        assert 'required' in response.data['month'].lower()

    def test_monthly_report_requires_scope(self, api_client):
        """Test that scope parameter is required."""
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01')
        assert response.status_code == 400
        assert 'scope' in response.data
        assert 'required' in response.data['scope'].lower()
    
    def test_monthly_report_invalid_format(self, api_client):
        """Test that month must be in YYYY-MM format."""
        response = api_client.get('/api/v1/reports/monthly/?month=2024/01&scope=OFFICE')
        
        assert response.status_code == 400
        assert 'month' in response.data
        assert 'format' in response.data['month'].lower()
    
    def test_monthly_report_empty_data(self, api_client, db):
        """Test monthly report with no data. MonthPeriod must exist (e.g. 2024-01)."""
        MonthPeriod.objects.get_or_create(month='2024-01', defaults={'status': 'OPEN'})
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=OFFICE')
        
        assert response.status_code == 200
        assert response.data['month'] == '2024-01'
        assert response.data['scope'] == 'OFFICE'
        assert response.data['rows'] == []
        assert response.data['totals']['planned'] == 0.0
        assert response.data['totals']['actual'] == 0.0

    def test_monthly_report_missing_month_period_returns_400_and_does_not_create_monthperiod(self, api_client, db):
        """Monthly report for a non-existent month should return 400 and not create MonthPeriod."""
        month_value = '2099-12'
        assert MonthPeriod.objects.filter(month=month_value).count() == 0

        response = api_client.get(f'/api/v1/reports/monthly/?month={month_value}&scope=OFFICE')

        assert response.status_code == 400
        assert response.data['month'] == MONTH_REQUIRED_MSG
        # Still no MonthPeriod implicitly created
        assert MonthPeriod.objects.filter(month=month_value).count() == 0
    
    def test_monthly_report_with_budget_lines(self, api_client, budget_plan_office, subcategory_office):
        """Test monthly report aggregates planned from BudgetLine."""
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=OFFICE')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_office.id
        assert response.data['rows'][0]['planned'] == 1000.0
        assert response.data['rows'][0]['actual'] == 0.0
        assert response.data['totals']['planned'] == 1000.0
    
    def test_monthly_report_with_actual_expenses(self, api_client, month_period, subcategory_office, admin_user):
        """Test monthly report aggregates actual from apps.expenses ActualExpense (month_period + scope)."""
        ExpenseActualExpense.objects.create(
            month_period=month_period,
            scope='OFFICE',
            category=subcategory_office,
            account='CASH',
            amount=Decimal('500.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=OFFICE')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_office.id
        assert response.data['rows'][0]['planned'] == 0.0
        assert response.data['rows'][0]['actual'] == 500.0
        assert response.data['totals']['actual'] == 500.0
    
    def test_monthly_report_calculates_delta_and_percent(self, api_client, budget_plan_office, subcategory_office, month_period, admin_user):
        """Test monthly report calculates delta and percent correctly."""
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        ExpenseActualExpense.objects.create(
            month_period=month_period,
            scope='OFFICE',
            category=subcategory_office,
            account='CASH',
            amount=Decimal('750.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=OFFICE')
        
        assert response.status_code == 200
        row = response.data['rows'][0]
        assert row['planned'] == 1000.0
        assert row['actual'] == 750.0
        assert row['delta'] == -250.0
        assert row['percent'] == 75.0  # 750/1000*100
    
    def test_monthly_report_scope_project(self, api_client, budget_plan_project, subcategory_project, month_period, admin_user):
        """Test monthly report with scope=PROJECT uses BudgetPlan and ExpenseActualExpense by month + scope."""
        BudgetLine.objects.create(
            plan=budget_plan_project,
            category=subcategory_project,
            amount_planned=Decimal('2000.00')
        )
        
        ExpenseActualExpense.objects.create(
            month_period=month_period,
            scope='PROJECT',
            category=subcategory_project,
            account='CASH',
            amount=Decimal('1500.00'),
            spent_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=PROJECT')
        
        assert response.status_code == 200
        assert response.data['scope'] == 'PROJECT'
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_id'] == subcategory_project.id
        assert response.data['rows'][0]['planned'] == 2000.0
        assert response.data['rows'][0]['actual'] == 1500.0
    
    def test_monthly_report_with_root_category(self, api_client, budget_plan_office, subcategory_office):
        """Test monthly report returns planned by category for the given scope."""
        BudgetLine.objects.create(
            plan=budget_plan_office,
            category=subcategory_office,
            amount_planned=Decimal('1000.00')
        )
        
        response = api_client.get('/api/v1/reports/monthly/?month=2024-01&scope=OFFICE')
        
        assert response.status_code == 200
        assert len(response.data['rows']) == 1
        assert response.data['rows'][0]['category_name'] == subcategory_office.name
        assert response.data['plan_id'] is not None


