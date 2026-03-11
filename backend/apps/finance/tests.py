"""
Tests for finance models and permissions.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from apps.budgeting.models import MonthPeriod
from apps.projects.models import Project, ProjectAssignment
from .models import FinancePeriod, IncomeEntry, IncomeSource, IncomePlan
from decimal import Decimal

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
def director_user(db):
    """Create director user."""
    return User.objects.create_user(
        username='director',
        email='director@test.com',
        password='testpass123',
        role='director'
    )


@pytest.fixture
def foreman_user(db):
    """Create foreman user."""
    return User.objects.create_user(
        username='foreman',
        email='foreman@test.com',
        password='testpass123',
        role='foreman'
    )


@pytest.fixture
def project(db, admin_user):
    """Create a project."""
    return Project.objects.create(
        name='Test Project',
        description='Test Description',
        status='active',
        created_by=admin_user
    )


@pytest.fixture
def month_period(db):
    """Create a month period."""
    return MonthPeriod.objects.create(
        month='2024-01',
        status='OPEN'
    )


class TestFinancePeriodModel:
    """Test FinancePeriod model validation."""
    
    def test_project_required_for_project_fund_kind(self, month_period, admin_user, project):
        """Test that project is required when fund_kind is 'project'."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='project',
            project=None,
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            finance_period.full_clean()
    
    def test_project_must_be_null_for_office(self, month_period, admin_user, project):
        """Test that project must be null when fund_kind is 'office'."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='office',
            project=project,
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            finance_period.full_clean()
    
    def test_project_must_be_null_for_charity(self, month_period, admin_user, project):
        """Test that project must be null when fund_kind is 'charity'."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='charity',
            project=project,
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            finance_period.full_clean()
    
    def test_valid_project_fund_kind(self, month_period, admin_user, project):
        """Test that project fund_kind with project is valid."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        finance_period.full_clean()  # Should not raise
        finance_period.save()
        assert finance_period.project == project
    
    def test_valid_office_fund_kind(self, month_period, admin_user):
        """Test that office fund_kind without project is valid."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        finance_period.full_clean()  # Should not raise
        finance_period.save()
        assert finance_period.project is None
    
    def test_valid_charity_fund_kind(self, month_period, admin_user):
        """Test that charity fund_kind without project is valid."""
        finance_period = FinancePeriod(
            month_period=month_period,
            fund_kind='charity',
            project=None,
            created_by=admin_user
        )
        finance_period.full_clean()  # Should not raise
        finance_period.save()
        assert finance_period.project is None


class TestFinancePeriodPermissions:
    """Test FinancePeriod RBAC permissions."""
    
    def test_foreman_cannot_see_charity(self, month_period, admin_user, foreman_user):
        """Test that foreman cannot see charity finance periods."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create charity finance period
        charity_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='charity',
            project=None,
            created_by=admin_user
        )
        
        # Create project finance period
        project = Project.objects.create(
            name='Test Project',
            status='active',
            created_by=admin_user
        )
        ProjectAssignment.objects.create(
            project=project,
            prorab=foreman_user
        )
        project_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Foreman should only see project finance period
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get('/api/v1/finance-periods/')
        assert response.status_code == 200
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert project_fp.id in finance_period_ids
        assert charity_fp.id not in finance_period_ids
    
    def test_foreman_cannot_see_office(self, month_period, admin_user, foreman_user, project):
        """Test that foreman cannot see office finance periods."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create office finance period
        office_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Create project assignment
        ProjectAssignment.objects.create(
            project=project,
            prorab=foreman_user
        )
        project_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Foreman should only see project finance period
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get('/api/v1/finance-periods/')
        assert response.status_code == 200
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert project_fp.id in finance_period_ids
        assert office_fp.id not in finance_period_ids
    
    def test_office_not_mixed_with_project(self, month_period, admin_user, project):
        """Test that office expenses are isolated from project expenses."""
        # Create office finance period
        office_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Create project finance period
        project_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Verify they are separate
        assert office_fp.fund_kind == 'office'
        assert office_fp.project is None
        assert project_fp.fund_kind == 'project'
        assert project_fp.project == project


class TestIncomeEntryModel:
    """Test IncomeEntry model validation."""
    
    def test_comment_required(self, month_period, admin_user, project):
        """Test that comment is required."""
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        income_entry = IncomeEntry(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='',
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            income_entry.full_clean()
    
    def test_amount_must_be_positive(self, month_period, admin_user, project):
        """Test that amount must be greater than zero."""
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Test zero amount
        income_entry = IncomeEntry(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('0.00'),
            received_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            income_entry.full_clean()
        
        # Test negative amount
        income_entry = IncomeEntry(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('-100.00'),
            received_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        with pytest.raises(ValidationError):
            income_entry.full_clean()
    
    def test_valid_income_entry(self, month_period, admin_user, project):
        """Test that valid income entry can be created."""
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        income_entry = IncomeEntry(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Test comment',
            created_by=admin_user
        )
        income_entry.full_clean()  # Should not raise
        income_entry.save()
        assert income_entry.amount == Decimal('1000.00')
        assert income_entry.comment == 'Test comment'


class TestIncomeEntryRBAC:
    """Test IncomeEntry RBAC permissions."""
    
    def test_admin_full_crud(self, month_period, admin_user, project):
        """Test that admin can create/read/update/delete income entries."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Create
        data = {
            'finance_period': finance_period.id,
            'amount': '1000.00',
            'received_at': '2024-01-15',
            'comment': 'Test income',
        }
        response = client.post('/api/v1/income-entries/', data)
        assert response.status_code == 201
        income_entry_id = response.data['id']
        
        # Read
        response = client.get(f'/api/v1/income-entries/{income_entry_id}/')
        assert response.status_code == 200
        
        # Update
        response = client.patch(f'/api/v1/income-entries/{income_entry_id}/', {'amount': '1500.00'})
        assert response.status_code == 200
        
        # Delete
        response = client.delete(f'/api/v1/income-entries/{income_entry_id}/')
        assert response.status_code == 204
    
    def test_director_read_only(self, month_period, admin_user, director_user, project):
        """Test that director is read-only and cannot create/update/delete."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Create income entry as admin
        income_entry = IncomeEntry.objects.create(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Test income',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(director_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Director can read
        response = client.get('/api/v1/income-entries/')
        assert response.status_code == 200
        
        response = client.get(f'/api/v1/income-entries/{income_entry.id}/')
        assert response.status_code == 200
        
        # Director cannot create
        data = {
            'finance_period': finance_period.id,
            'amount': '2000.00',
            'received_at': '2024-01-16',
            'comment': 'New income',
        }
        response = client.post('/api/v1/income-entries/', data)
        assert response.status_code == 403
        
        # Director cannot update
        response = client.patch(f'/api/v1/income-entries/{income_entry.id}/', {'amount': '1500.00'})
        assert response.status_code == 403
        
        # Director cannot delete
        response = client.delete(f'/api/v1/income-entries/{income_entry.id}/')
        assert response.status_code == 403
    
    def test_foreman_read_only_assigned_projects(self, month_period, admin_user, foreman_user):
        """Test that foreman can only see income entries for assigned projects."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create two projects
        assigned_project = Project.objects.create(
            name='Assigned Project',
            status='active',
            created_by=admin_user
        )
        unassigned_project = Project.objects.create(
            name='Unassigned Project',
            status='active',
            created_by=admin_user
        )
        
        # Assign foreman to only one project
        ProjectAssignment.objects.create(
            project=assigned_project,
            prorab=foreman_user
        )
        
        # Create finance periods
        assigned_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=assigned_project,
            created_by=admin_user
        )
        unassigned_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=unassigned_project,
            created_by=admin_user
        )
        
        # Create income entries
        assigned_entry = IncomeEntry.objects.create(
            finance_period=assigned_fp,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Assigned project income',
            created_by=admin_user
        )
        unassigned_entry = IncomeEntry.objects.create(
            finance_period=unassigned_fp,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-01-15',
            comment='Unassigned project income',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Foreman should only see assigned project income entry
        response = client.get('/api/v1/income-entries/')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert assigned_entry.id in entry_ids
        assert unassigned_entry.id not in entry_ids
        
        # Foreman can retrieve assigned entry
        response = client.get(f'/api/v1/income-entries/{assigned_entry.id}/')
        assert response.status_code == 200
        
        # Foreman cannot retrieve unassigned entry
        response = client.get(f'/api/v1/income-entries/{unassigned_entry.id}/')
        assert response.status_code == 404
    
    def test_foreman_cannot_see_office_charity(self, month_period, admin_user, foreman_user, project):
        """Test that foreman cannot see office/charity income entries."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create project assignment
        ProjectAssignment.objects.create(
            project=project,
            prorab=foreman_user
        )
        
        # Create finance periods
        project_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        office_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        charity_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='charity',
            project=None,
            created_by=admin_user
        )
        
        # Create income entries
        project_entry = IncomeEntry.objects.create(
            finance_period=project_fp,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Project income',
            created_by=admin_user
        )
        office_entry = IncomeEntry.objects.create(
            finance_period=office_fp,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-01-15',
            comment='Office income',
            created_by=admin_user
        )
        charity_entry = IncomeEntry.objects.create(
            finance_period=charity_fp,
            account='CASH',
            amount=Decimal('3000.00'),
            received_at='2024-01-15',
            comment='Charity income',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Foreman should only see project income entry
        response = client.get('/api/v1/income-entries/')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert project_entry.id in entry_ids
        assert office_entry.id not in entry_ids
        assert charity_entry.id not in entry_ids


class TestIncomeEntryFiltering:
    """Test IncomeEntry filtering."""
    
    def test_filter_by_finance_period(self, month_period, admin_user, project):
        """Test filtering by finance_period."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        finance_period1 = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        finance_period2 = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        entry1 = IncomeEntry.objects.create(
            finance_period=finance_period1,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Entry 1',
            created_by=admin_user
        )
        entry2 = IncomeEntry.objects.create(
            finance_period=finance_period2,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-01-16',
            comment='Entry 2',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get(f'/api/v1/income-entries/?finance_period={finance_period1.id}')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert entry1.id in entry_ids
        assert entry2.id not in entry_ids
    
    def test_filter_by_month(self, month_period, admin_user, project):
        """Test filtering by month (YYYY-MM)."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        entry1 = IncomeEntry.objects.create(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='January entry',
            created_by=admin_user
        )
        entry2 = IncomeEntry.objects.create(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-02-15',
            comment='February entry',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get('/api/v1/income-entries/?month=2024-01')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert entry1.id in entry_ids
        assert entry2.id not in entry_ids
    
    def test_filter_by_fund_kind(self, month_period, admin_user, project):
        """Test filtering by fund_kind."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        project_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        office_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        project_entry = IncomeEntry.objects.create(
            finance_period=project_fp,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Project income',
            created_by=admin_user
        )
        office_entry = IncomeEntry.objects.create(
            finance_period=office_fp,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-01-15',
            comment='Office income',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get('/api/v1/income-entries/?fund_kind=project')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert project_entry.id in entry_ids
        assert office_entry.id not in entry_ids
    
    def test_filter_by_project(self, month_period, admin_user):
        """Test filtering by project."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        project1 = Project.objects.create(
            name='Project 1',
            status='active',
            created_by=admin_user
        )
        project2 = Project.objects.create(
            name='Project 2',
            status='active',
            created_by=admin_user
        )
        
        fp1 = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project1,
            created_by=admin_user
        )
        fp2 = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project2,
            created_by=admin_user
        )
        
        entry1 = IncomeEntry.objects.create(
            finance_period=fp1,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Project 1 income',
            created_by=admin_user
        )
        entry2 = IncomeEntry.objects.create(
            finance_period=fp2,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-01-15',
            comment='Project 2 income',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get(f'/api/v1/income-entries/?project={project1.id}')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert entry1.id in entry_ids
        assert entry2.id not in entry_ids
    
    def test_combination_filters(self, month_period, admin_user, project):
        """Test combination of filters."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        entry1 = IncomeEntry.objects.create(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('1000.00'),
            received_at='2024-01-15',
            comment='Match all filters',
            created_by=admin_user
        )
        entry2 = IncomeEntry.objects.create(
            finance_period=finance_period,
            account='CASH',
            amount=Decimal('2000.00'),
            received_at='2024-02-15',
            comment='Different month',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Filter by finance_period AND month
        response = client.get(f'/api/v1/income-entries/?finance_period={finance_period.id}&month=2024-01')
        assert response.status_code == 200
        entry_ids = [entry['id'] for entry in response.data['results']]
        assert entry1.id in entry_ids
        assert entry2.id not in entry_ids
    
    def test_model_validation_fund_kind_change_project_to_office(self, month_period, admin_user, project):
        """Test validation when changing fund_kind from project to office."""
        # Create project finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Try to change to office without removing project
        finance_period.fund_kind = 'office'
        with pytest.raises(ValidationError):
            finance_period.full_clean()
        
        # Change to office and remove project - should work
        finance_period.fund_kind = 'office'
        finance_period.project = None
        finance_period.full_clean()  # Should not raise
        finance_period.save()
        assert finance_period.fund_kind == 'office'
        assert finance_period.project is None
    
    def test_model_validation_fund_kind_change_office_to_project(self, month_period, admin_user, project):
        """Test validation when changing fund_kind from office to project."""
        # Create office finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Try to change to project without setting project
        finance_period.fund_kind = 'project'
        with pytest.raises(ValidationError):
            finance_period.full_clean()
        
        # Change to project and set project - should work
        finance_period.fund_kind = 'project'
        finance_period.project = project
        finance_period.full_clean()  # Should not raise
        finance_period.save()
        assert finance_period.fund_kind == 'project'
        assert finance_period.project == project
    
    def test_director_read_only_finance_period(self, month_period, admin_user, director_user, project):
        """Test that director is read-only and cannot create/update/delete FinancePeriod."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create finance period as admin
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(director_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Director can read
        response = client.get('/api/v1/finance-periods/')
        assert response.status_code == 200
        
        response = client.get(f'/api/v1/finance-periods/{finance_period.id}/')
        assert response.status_code == 200
        
        # Director cannot create
        data = {
            'month_period': month_period.id,
            'fund_kind': 'project',
            'project': project.id,
        }
        response = client.post('/api/v1/finance-periods/', data)
        assert response.status_code == 403
        
        # Director cannot update
        response = client.patch(f'/api/v1/finance-periods/{finance_period.id}/', {'income_comment': 'Updated'})
        assert response.status_code == 403
        
        # Director cannot delete
        response = client.delete(f'/api/v1/finance-periods/{finance_period.id}/')
        assert response.status_code == 403
    
    def test_foreman_cannot_see_unassigned_project(self, month_period, admin_user, foreman_user):
        """Test that foreman cannot see project finance periods for unassigned projects."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create two projects
        assigned_project = Project.objects.create(
            name='Assigned Project',
            status='active',
            created_by=admin_user
        )
        unassigned_project = Project.objects.create(
            name='Unassigned Project',
            status='active',
            created_by=admin_user
        )
        
        # Assign foreman to only one project
        ProjectAssignment.objects.create(
            project=assigned_project,
            prorab=foreman_user
        )
        
        # Create finance periods for both projects
        assigned_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=assigned_project,
            created_by=admin_user
        )
        unassigned_fp = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=unassigned_project,
            created_by=admin_user
        )
        
        # Foreman should only see assigned project finance period
        client = APIClient()
        token = RefreshToken.for_user(foreman_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get('/api/v1/finance-periods/')
        assert response.status_code == 200
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert assigned_fp.id in finance_period_ids
        assert unassigned_fp.id not in finance_period_ids
        
        # Foreman should be able to retrieve assigned project finance period
        response = client.get(f'/api/v1/finance-periods/{assigned_fp.id}/')
        assert response.status_code == 200
        
        # Foreman should not be able to retrieve unassigned project finance period
        response = client.get(f'/api/v1/finance-periods/{unassigned_fp.id}/')
        assert response.status_code == 404


class TestFinancePeriodFiltering:
    """Test FinancePeriod filtering by year/month."""
    
    def test_filter_by_year_and_month_integers(self, admin_user):
        """Test filtering by year and month as integers (?year=2026&month=2)."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create month period for 2026-02
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='OPEN'
        )
        
        # Create office finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Create another month period and finance period for different month
        other_month_period = MonthPeriod.objects.create(
            month='2026-03',
            status='OPEN'
        )
        other_finance_period = FinancePeriod.objects.create(
            month_period=other_month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Filter by year=2026&month=2&fund_kind=office
        response = client.get('/api/v1/finance-periods/?year=2026&month=2&fund_kind=office')
        assert response.status_code == 200
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert finance_period.id in finance_period_ids
        assert other_finance_period.id not in finance_period_ids
    
    def test_filter_by_month_string(self, admin_user):
        """Test filtering by month as string (?month=2026-02)."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create month period for 2026-02
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='OPEN'
        )
        
        # Create office finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Create another month period and finance period for different month
        other_month_period = MonthPeriod.objects.create(
            month='2026-03',
            status='OPEN'
        )
        other_finance_period = FinancePeriod.objects.create(
            month_period=other_month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Filter by month=2026-02&fund_kind=office
        response = client.get('/api/v1/finance-periods/?month=2026-02&fund_kind=office')
        assert response.status_code == 200
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert finance_period.id in finance_period_ids
        assert other_finance_period.id not in finance_period_ids
    
    def test_filter_invalid_month_value(self, admin_user):
        """Test that invalid month values don't crash (month=13)."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create month period
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='OPEN'
        )
        
        # Create finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Filter with invalid month (13) - should not crash, just skip filtering
        response = client.get('/api/v1/finance-periods/?year=2026&month=13&fund_kind=office')
        assert response.status_code == 200
        # Should return all finance periods (no filtering applied)
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert finance_period.id in finance_period_ids
    
    def test_filter_invalid_month_string(self, admin_user):
        """Test that invalid month string doesn't crash."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create month period
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='OPEN'
        )
        
        # Create finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Filter with invalid year/month (non-numeric) - should not crash
        response = client.get('/api/v1/finance-periods/?year=invalid&month=abc&fund_kind=office')
        assert response.status_code == 200
        # Should return all finance periods (no filtering applied)
        finance_period_ids = [fp['id'] for fp in response.data['results']]
        assert finance_period.id in finance_period_ids


class TestIncomeSummaryEndpoint:
    """Test income summary endpoint."""
    
    def test_income_summary_endpoint_returns_200(self, month_period, admin_user, project):
        """Test that income summary endpoint returns 200 status."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Create income source
        source = IncomeSource.objects.create(name='Test Source')
        
        # Create income plan
        IncomePlan.objects.create(
            period=finance_period,
            source=source,
            amount=Decimal('1000.00')
        )
        
        # Create income entry
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source,
            account='CASH',
            amount=Decimal('1200.00'),
            received_at='2024-01-15',
            comment='Test entry',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get(f'/api/v1/finance-periods/{finance_period.id}/income-summary/')
        assert response.status_code == 200
        assert 'rows' in response.data
        assert 'planned_total' in response.data
        assert 'actual_total' in response.data
        assert 'diff_total' in response.data
    
    def test_income_summary_includes_union_of_sources(self, month_period, admin_user, project):
        """Test that rows include sources from both plans and entries (union)."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Create sources
        source_plan_only = IncomeSource.objects.create(name='Plan Only Source')
        source_entry_only = IncomeSource.objects.create(name='Entry Only Source')
        source_both = IncomeSource.objects.create(name='Both Source')
        
        # Create income plan for source_plan_only
        IncomePlan.objects.create(
            period=finance_period,
            source=source_plan_only,
            amount=Decimal('500.00')
        )
        
        # Create income entry for source_entry_only (unplanned actual)
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source_entry_only,
            account='CASH',
            amount=Decimal('300.00'),
            received_at='2024-01-15',
            comment='Unplanned entry',
            created_by=admin_user
        )
        
        # Create both plan and entry for source_both
        IncomePlan.objects.create(
            period=finance_period,
            source=source_both,
            amount=Decimal('1000.00')
        )
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source_both,
            account='CASH',
            amount=Decimal('1100.00'),
            received_at='2024-01-16',
            comment='Planned entry',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get(f'/api/v1/finance-periods/{finance_period.id}/income-summary/')
        assert response.status_code == 200
        
        rows = response.data['rows']
        source_ids = [row['source_id'] for row in rows]
        
        # Verify all three sources appear (union)
        assert source_plan_only.id in source_ids
        assert source_entry_only.id in source_ids
        assert source_both.id in source_ids
        
        # Verify plan-only source has planned but no actual
        plan_only_row = next(row for row in rows if row['source_id'] == source_plan_only.id)
        assert plan_only_row['planned'] == '500.00'
        assert plan_only_row['actual'] == '0.00'
        assert plan_only_row['plans_count'] == 1
        assert plan_only_row['entries_count'] == 0
        
        # Verify entry-only source has actual but no planned
        entry_only_row = next(row for row in rows if row['source_id'] == source_entry_only.id)
        assert entry_only_row['planned'] == '0.00'
        assert entry_only_row['actual'] == '300.00'
        assert entry_only_row['plans_count'] == 0
        assert entry_only_row['entries_count'] == 1
        
        # Verify both source has both planned and actual
        both_row = next(row for row in rows if row['source_id'] == source_both.id)
        assert both_row['planned'] == '1000.00'
        assert both_row['actual'] == '1100.00'
        assert both_row['diff'] == '100.00'
        assert both_row['plans_count'] == 1
        assert both_row['entries_count'] == 1
    
    def test_income_summary_totals_correct(self, month_period, admin_user, project):
        """Test that planned_total, actual_total, and diff_total are calculated correctly."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create finance period
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            created_by=admin_user
        )
        
        # Create sources
        source1 = IncomeSource.objects.create(name='Source 1')
        source2 = IncomeSource.objects.create(name='Source 2')
        
        # Create income plans
        IncomePlan.objects.create(
            period=finance_period,
            source=source1,
            amount=Decimal('1000.00')
        )
        IncomePlan.objects.create(
            period=finance_period,
            source=source2,
            amount=Decimal('2000.00')
        )
        
        # Create income entries
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source1,
            account='CASH',
            amount=Decimal('1100.00'),
            received_at='2024-01-15',
            comment='Entry 1',
            created_by=admin_user
        )
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source2,
            account='CASH',
            amount=Decimal('1900.00'),
            received_at='2024-01-16',
            comment='Entry 2',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = client.get(f'/api/v1/finance-periods/{finance_period.id}/income-summary/')
        assert response.status_code == 200
        
        # Verify totals
        planned_total = Decimal(response.data['planned_total'])
        actual_total = Decimal(response.data['actual_total'])
        diff_total = Decimal(response.data['diff_total'])
        
        # Expected: planned = 1000 + 2000 = 3000
        assert planned_total == Decimal('3000.00')
        
        # Expected: actual = 1100 + 1900 = 3000
        assert actual_total == Decimal('3000.00')
        
        # Expected: diff = 3000 - 3000 = 0
        assert diff_total == Decimal('0.00')
        
        # Verify totals match sum of rows
        rows = response.data['rows']
        calculated_planned = sum(Decimal(row['planned']) for row in rows)
        calculated_actual = sum(Decimal(row['actual']) for row in rows)
        calculated_diff = calculated_actual - calculated_planned
        
        assert calculated_planned == planned_total
        assert calculated_actual == actual_total
        assert calculated_diff == diff_total
    
    def test_income_summary_specific_values(self, admin_user):
        """Test income summary with specific values: office fund_kind, sources A and B."""
        from rest_framework.test import APIClient
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Create MonthPeriod with status OPEN
        month_period = MonthPeriod.objects.create(
            month='2024-01',
            status='OPEN'
        )
        
        # Create FinancePeriod with fund_kind='office' (no project)
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            created_by=admin_user
        )
        
        # Create 2 IncomeSource (A and B)
        source_a = IncomeSource.objects.create(name='Source A')
        source_b = IncomeSource.objects.create(name='Source B')
        
        # Create IncomePlan for source A with amount 100
        IncomePlan.objects.create(
            period=finance_period,
            source=source_a,
            amount=Decimal('100.00')
        )
        
        # Create IncomeEntry for source A with amount 40
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source_a,
            account='CASH',
            amount=Decimal('40.00'),
            received_at='2024-01-15',
            comment='Entry for source A',
            created_by=admin_user
        )
        
        # Create IncomeEntry for source B with amount 10
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=source_b,
            account='CASH',
            amount=Decimal('10.00'),
            received_at='2024-01-16',
            comment='Entry for source B',
            created_by=admin_user
        )
        
        client = APIClient()
        token = RefreshToken.for_user(admin_user)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Call GET /api/v1/finance-periods/{id}/income-summary/
        response = client.get(f'/api/v1/finance-periods/{finance_period.id}/income-summary/')
        
        # Assert status_code == 200
        assert response.status_code == 200
        
        # Assert rows include both sources A and B
        rows = response.data['rows']
        source_ids = [row['source_id'] for row in rows]
        assert source_a.id in source_ids
        assert source_b.id in source_ids
        
        # Assert totals
        assert response.data['planned_total'] == '100.00'
        assert response.data['actual_total'] == '50.00'
        assert response.data['diff_total'] == '-50.00'
        
        # Assert row values for source A
        row_a = next(row for row in rows if row['source_id'] == source_a.id)
        assert row_a['planned'] == '100.00'
        assert row_a['actual'] == '40.00'
        assert row_a['diff'] == '-60.00'
        
        # Assert row values for source B
        row_b = next(row for row in rows if row['source_id'] == source_b.id)
        assert row_b['planned'] == '0.00'
        assert row_b['actual'] == '10.00'
        assert row_b['diff'] == '10.00'


class TestFinancePeriodStatusPropagation:
    """Test FinancePeriod status propagation from MonthPeriod."""
    
    def test_finance_period_status_syncs_when_month_period_locked(self, admin_user):
        """Test that FinancePeriod.status updates to 'locked' when MonthPeriod is locked."""
        from apps.finance.services import FinancePeriodService
        
        # Create MonthPeriod with OPEN status
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='OPEN'
        )
        
        # Create FinancePeriod with 'open' status
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='open',
            created_by=admin_user
        )
        
        # Lock MonthPeriod
        month_period.status = 'LOCKED'
        month_period.save()
        
        # Sync FinancePeriod status
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        # Refresh from DB
        finance_period.refresh_from_db()
        
        # Assert FinancePeriod status is now 'locked'
        assert finance_period.status == 'locked'
    
    def test_finance_period_status_syncs_when_month_period_opened(self, admin_user):
        """Test that FinancePeriod.status updates to 'open' when MonthPeriod is opened."""
        from apps.finance.services import FinancePeriodService
        
        # Create MonthPeriod with LOCKED status
        month_period = MonthPeriod.objects.create(
            month='2026-03',
            status='LOCKED'
        )
        
        # Create FinancePeriod with 'locked' status
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='locked',
            created_by=admin_user
        )
        
        # Open MonthPeriod
        month_period.status = 'OPEN'
        month_period.save()
        
        # Sync FinancePeriod status
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        # Refresh from DB
        finance_period.refresh_from_db()
        
        # Assert FinancePeriod status is now 'open'
        assert finance_period.status == 'open'
    
    def test_multiple_finance_periods_sync_correctly(self, admin_user, project):
        """Test that multiple FinancePeriod objects (different fund_kinds) all update correctly."""
        from apps.finance.services import FinancePeriodService
        
        # Create MonthPeriod with OPEN status
        month_period = MonthPeriod.objects.create(
            month='2026-04',
            status='OPEN'
        )
        
        # Create multiple FinancePeriod objects with different fund_kinds
        fp_office = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='open',
            created_by=admin_user
        )
        fp_charity = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='charity',
            project=None,
            status='open',
            created_by=admin_user
        )
        fp_project = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='project',
            project=project,
            status='open',
            created_by=admin_user
        )
        
        # Lock MonthPeriod
        month_period.status = 'LOCKED'
        month_period.save()
        
        # Sync FinancePeriod status
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        # Refresh from DB
        fp_office.refresh_from_db()
        fp_charity.refresh_from_db()
        fp_project.refresh_from_db()
        
        # Assert all FinancePeriod statuses are now 'locked'
        assert fp_office.status == 'locked'
        assert fp_charity.status == 'locked'
        assert fp_project.status == 'locked'


class TestIncomePlanMonthPeriodValidation:
    """Test IncomePlan creation validation with MonthPeriod status."""
    
    def test_income_plan_creation_fails_when_month_period_locked(self, admin_user):
        """Test that IncomePlan creation fails when MonthPeriod is LOCKED (even if FinancePeriod is 'open')."""
        from apps.finance.services import IncomePlanService
        from rest_framework.exceptions import PermissionDenied
        
        # Create MonthPeriod with LOCKED status
        month_period = MonthPeriod.objects.create(
            month='2026-02',
            status='LOCKED'
        )
        
        # Create FinancePeriod with 'open' status (mismatched state - the bug scenario)
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='open',  # Still 'open' even though MonthPeriod is LOCKED
            created_by=admin_user
        )
        
        # Create income source
        source = IncomeSource.objects.create(name='Test Source')
        
        # Try to create IncomePlan - should fail due to MonthPeriod being LOCKED
        income_plan = IncomePlan(
            period=finance_period,
            source=source,
            amount=Decimal('100.00')
        )
        
        with pytest.raises(PermissionDenied) as exc_info:
            IncomePlanService.assert_period_open(income_plan)
        
        assert "Month period is closed/locked" in str(exc_info.value)
    
    def test_income_plan_creation_succeeds_when_month_period_open(self, admin_user):
        """Test that IncomePlan creation succeeds when MonthPeriod is OPEN and FinancePeriod is 'open'."""
        from apps.finance.services import IncomePlanService
        
        # Create MonthPeriod with OPEN status
        month_period = MonthPeriod.objects.create(
            month='2026-05',
            status='OPEN'
        )
        
        # Create FinancePeriod with 'open' status
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='open',
            created_by=admin_user
        )
        
        # Create income source
        source = IncomeSource.objects.create(name='Test Source')
        
        # Create IncomePlan - should succeed
        income_plan = IncomePlan(
            period=finance_period,
            source=source,
            amount=Decimal('100.00')
        )
        
        # Should not raise exception
        IncomePlanService.assert_period_open(income_plan)
        
        # Verify we can actually create it
        income_plan.save()
        assert income_plan.id is not None
    
    def test_income_plan_creation_fails_when_finance_period_locked(self, admin_user):
        """Test that IncomePlan creation fails when FinancePeriod is 'locked' even if MonthPeriod is OPEN."""
        from apps.finance.services import IncomePlanService
        from rest_framework.exceptions import PermissionDenied
        
        # Create MonthPeriod with OPEN status
        month_period = MonthPeriod.objects.create(
            month='2026-06',
            status='OPEN'
        )
        
        # Create FinancePeriod with 'locked' status
        finance_period = FinancePeriod.objects.create(
            month_period=month_period,
            fund_kind='office',
            project=None,
            status='locked',
            created_by=admin_user
        )
        
        # Create income source
        source = IncomeSource.objects.create(name='Test Source')
        
        # Try to create IncomePlan - should fail due to FinancePeriod being 'locked'
        income_plan = IncomePlan(
            period=finance_period,
            source=source,
            amount=Decimal('100.00')
        )
        
        with pytest.raises(PermissionDenied) as exc_info:
            IncomePlanService.assert_period_open(income_plan)
        
        assert "Period is closed" in str(exc_info.value)

