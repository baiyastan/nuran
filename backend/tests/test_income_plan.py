"""
Tests for IncomePlan API.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken
from decimal import Decimal
from apps.budgeting.models import MonthPeriod
from apps.finance.models import FinancePeriod, IncomeSource, IncomePlan

User = get_user_model()


@pytest.fixture
def api_client():
    """Create API client."""
    return APIClient()


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
def income_source(db):
    """Create an income source."""
    return IncomeSource.objects.create(
        name='Test Source',
        is_active=True
    )


@pytest.fixture
def month_period(db):
    """Create a month period."""
    return MonthPeriod.objects.create(
        month='2026-02',
        status='OPEN'
    )


@pytest.fixture
def finance_period_office(db, month_period, admin_user):
    """Create FinancePeriod for office."""
    return FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind='office',
        project=None,
        status='open',
        created_by=admin_user
    )


class TestIncomePlanAPI:
    """Test IncomePlan API endpoints."""
    
    def test_create_income_plan_success(self, api_client, admin_user, income_source, finance_period_office):
        """Test successful IncomePlan creation."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {
            'year': 2026,
            'month': 2,
            'source_id': income_source.id,
            'amount': '10000.00'
        }
        response = api_client.post('/api/v1/income/plans/', data, format='json')
        assert response.status_code == 201
        assert response.data['amount'] == '10000.00'
        assert response.data['source']['id'] == income_source.id
    
    def test_create_income_plan_missing_month_period(self, api_client, admin_user, income_source):
        """Test IncomePlan creation fails with 400 when MonthPeriod does not exist."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Ensure MonthPeriod does not exist for 2026-02
        MonthPeriod.objects.filter(month='2026-02').delete()
        
        data = {
            'year': 2026,
            'month': 2,
            'source_id': income_source.id,
            'amount': '10000.00'
        }
        response = api_client.post('/api/v1/income/plans/', data, format='json')
        assert response.status_code == 400
        assert 'non_field_errors' in response.data
        assert len(response.data['non_field_errors']) > 0
        assert 'Month period 2026-02 does not exist' in response.data['non_field_errors'][0]
    
    def test_create_income_plan_missing_finance_period(self, api_client, admin_user, income_source, month_period):
        """Test IncomePlan creation fails with 400 when FinancePeriod does not exist."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Ensure FinancePeriod does not exist for office fund_kind
        FinancePeriod.objects.filter(month_period=month_period, fund_kind='office').delete()
        
        data = {
            'year': 2026,
            'month': 2,
            'source_id': income_source.id,
            'amount': '10000.00'
        }
        response = api_client.post('/api/v1/income/plans/', data, format='json')
        assert response.status_code == 400
        assert 'non_field_errors' in response.data
        assert len(response.data['non_field_errors']) > 0
        assert 'Finance period for 2026-02 with fund_kind=office does not exist' in response.data['non_field_errors'][0]
    
    def test_create_income_plan_locked_month_period(self, api_client, admin_user, income_source, finance_period_office):
        """Test IncomePlan creation fails with 403 when MonthPeriod is LOCKED."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Lock the month period
        finance_period_office.month_period.status = 'LOCKED'
        finance_period_office.month_period.save()
        
        data = {
            'year': 2026,
            'month': 2,
            'source_id': income_source.id,
            'amount': '10000.00'
        }
        response = api_client.post('/api/v1/income/plans/', data, format='json')
        assert response.status_code == 403
        assert 'detail' in response.data
        assert 'locked' in response.data['detail'].lower()
    
    def test_update_income_plan_locked_month_period(self, api_client, admin_user, income_source, finance_period_office):
        """Test IncomePlan update fails with 403 when MonthPeriod is LOCKED."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Create an income plan first
        income_plan = IncomePlan.objects.create(
            period=finance_period_office,
            source=income_source,
            amount=Decimal('10000.00')
        )
        
        # Lock the month period
        finance_period_office.month_period.status = 'LOCKED'
        finance_period_office.month_period.save()
        
        data = {
            'amount': '15000.00'
        }
        response = api_client.patch(f'/api/v1/income/plans/{income_plan.id}/', data, format='json')
        assert response.status_code == 403
        assert 'detail' in response.data
        assert 'locked' in response.data['detail'].lower()
    
    def test_delete_income_plan_locked_month_period(self, api_client, admin_user, income_source, finance_period_office):
        """Test IncomePlan deletion fails with 403 when MonthPeriod is LOCKED."""
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        # Create an income plan first
        income_plan = IncomePlan.objects.create(
            period=finance_period_office,
            source=income_source,
            amount=Decimal('10000.00')
        )
        
        # Lock the month period
        finance_period_office.month_period.status = 'LOCKED'
        finance_period_office.month_period.save()
        
        response = api_client.delete(f'/api/v1/income/plans/{income_plan.id}/')
        assert response.status_code == 403
        assert 'detail' in response.data
        assert 'locked' in response.data['detail'].lower()


