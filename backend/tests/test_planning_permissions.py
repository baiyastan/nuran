"""
Tests for planning permissions.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.projects.models import Project
from apps.planning.models import PlanPeriod, PlanItem

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
def plan_period(db, project, foreman_user):
    """Create a plan period."""
    return PlanPeriod.objects.create(
        project=project,
        period='2024-01',
        status='draft',
        created_by=foreman_user
    )


@pytest.fixture
def plan_item(db, plan_period, foreman_user):
    """Create a plan item."""
    return PlanItem.objects.create(
        plan_period=plan_period,
        title='Test Item',
        qty=10.0,
        unit='kg',
        amount=1000.0,
        created_by=foreman_user
    )


class TestPlanItemPermissions:
    """Test PlanItem API permissions."""
    
    def test_foreman_can_create(self, api_client, foreman_user, plan_period):
        """Test that foreman can create plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {
            'plan_period': plan_period.id,
            'title': 'New Item',
            'qty': '5.0',
            'unit': 'kg',
            'amount': '500.0',
        }
        response = api_client.post('/api/v1/plan-items/', data)
        assert response.status_code == 201
    
    def test_foreman_cannot_update(self, api_client, foreman_user, plan_item):
        """Test that foreman cannot update plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {'title': 'Updated Title'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', data)
        assert response.status_code == 403
    
    def test_foreman_cannot_delete(self, api_client, foreman_user, plan_item):
        """Test that foreman cannot delete plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = api_client.delete(f'/api/v1/plan-items/{plan_item.id}/')
        assert response.status_code == 403
    
    def test_director_can_update(self, api_client, director_user, plan_item):
        """Test that director can update plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {'title': 'Updated Title'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', data)
        assert response.status_code == 200
    
    def test_director_can_submit(self, api_client, foreman_user, director_user, plan_period):
        """Test that director can approve plan periods."""
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Foreman submits
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 200
        
        # Director approves
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 200
        assert response.data['status'] == 'approved'

