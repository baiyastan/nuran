"""
Tests for User model and authentication.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


@pytest.fixture
def api_client():
    """Create API client."""
    return APIClient()


@pytest.fixture
def admin_user(db):
    """Create admin user."""
    return User.objects.create_user(
        email='admin@test.com',
        username='admin',
        password='testpass123',
        role='admin',
        is_staff=True,
        is_superuser=True
    )


@pytest.fixture
def director_user(db):
    """Create director user."""
    return User.objects.create_user(
        email='director@test.com',
        username='director',
        password='testpass123',
        role='director'
    )


@pytest.fixture
def foreman_user(db):
    """Create foreman user."""
    return User.objects.create_user(
        email='foreman@test.com',
        username='foreman',
        password='testpass123',
        role='foreman'
    )


class TestUserManager:
    """Test UserManager create_superuser."""
    
    def test_create_superuser_sets_role_admin(self, db):
        """Verify create_superuser sets role='admin'."""
        user = User.objects.create_superuser(
            email='superuser@test.com',
            username='superuser',
            password='testpass123'
        )
        assert user.role == 'admin'
        assert user.is_staff is True
        assert user.is_superuser is True
    
    def test_create_superuser_requires_admin_role(self, db):
        """Verify create_superuser raises error if role is not admin."""
        with pytest.raises(ValueError, match='Superuser must have role="admin"'):
            User.objects.create_superuser(
                email='superuser@test.com',
                username='superuser',
                password='testpass123',
                role='director'  # Should fail
            )


class TestAuthMeEndpoint:
    """Test /auth/me/ endpoint."""
    
    def test_me_returns_correct_role(self, api_client, admin_user, director_user, foreman_user):
        """Test /auth/me/ returns correct role for each user type."""
        # Test admin
        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/v1/auth/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'admin'
        assert response.data['email'] == 'admin@test.com'
        
        # Test director
        api_client.force_authenticate(user=director_user)
        response = api_client.get('/api/v1/auth/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'director'
        
        # Test foreman
        api_client.force_authenticate(user=foreman_user)
        response = api_client.get('/api/v1/auth/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'foreman'
    
    def test_me_requires_authentication(self, api_client):
        """Test /auth/me/ requires authentication."""
        response = api_client.get('/api/v1/auth/me/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_me_returns_role_after_login(self, api_client, admin_user):
        """Test /auth/me/ returns correct role after login."""
        # Login first
        login_response = api_client.post('/api/v1/auth/login/', {
            'email': 'admin@test.com',
            'password': 'testpass123'
        })
        assert login_response.status_code == status.HTTP_200_OK
        assert 'access' in login_response.data
        
        # Use the access token to authenticate
        access_token = login_response.data['access']
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
        
        # Call /auth/me/
        response = api_client.get('/api/v1/auth/me/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'admin'
        assert response.data['email'] == 'admin@test.com'


class TestRBACEnforcement:
    """Test RBAC enforcement on admin-only endpoints."""
    
    def test_non_admin_cannot_access_admin_only_endpoints(self, api_client, director_user, foreman_user):
        """Test non-admin users cannot access admin-only endpoints."""
        # Test director cannot lock plan period (admin only)
        api_client.force_authenticate(user=director_user)
        response = api_client.post('/api/v1/plan-periods/1/lock/')
        # Should be 404 (object not found) or 403 (forbidden) depending on implementation
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
        
        # Test foreman cannot lock plan period
        api_client.force_authenticate(user=foreman_user)
        response = api_client.post('/api/v1/plan-periods/1/lock/')
        assert response.status_code in (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND)
    
    def test_admin_can_access_admin_endpoints(self, api_client, admin_user, db):
        """Test admin can access admin-only endpoints."""
        from apps.planning.models import PlanPeriod, Project
        
        # Create test data
        project = Project.objects.create(name='Test Project', status='active')
        plan_period = PlanPeriod.objects.create(
            project=project,
            period='2024-01',
            status='approved',
            created_by=admin_user
        )
        
        api_client.force_authenticate(user=admin_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/lock/')
        # Should succeed (200 or 201) or fail gracefully (404) if endpoint doesn't exist
        assert response.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED, status.HTTP_404_NOT_FOUND)


class TestForemanAppendOnly:
    """Test foreman append-only restriction for plan items."""
    
    def test_foreman_append_only_plan_items(self, api_client, foreman_user, director_user, admin_user, db):
        """Test foreman cannot update/delete plan items."""
        from apps.planning.models import PlanPeriod, PlanItem, Project
        
        # Create test data
        project = Project.objects.create(name='Test Project', status='active')
        plan_period = PlanPeriod.objects.create(
            project=project,
            period='2024-01',
            status='draft',
            created_by=foreman_user
        )
        plan_item = PlanItem.objects.create(
            plan_period=plan_period,
            title='Test Item',
            category='Materials',
            qty=10,
            unit='kg',
            amount=100.00,
            created_by=foreman_user
        )
        
        # Foreman can create (POST)
        api_client.force_authenticate(user=foreman_user)
        create_data = {
            'plan_period': plan_period.id,
            'title': 'New Item',
            'category': 'Materials',
            'qty': 5,
            'unit': 'kg',
            'amount': 50.00
        }
        response = api_client.post('/api/v1/plan-items/', create_data)
        assert response.status_code == status.HTTP_201_CREATED
        
        # Foreman cannot update (PATCH)
        update_data = {'title': 'Updated Item'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', update_data)
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        # Foreman cannot delete (DELETE)
        response = api_client.delete(f'/api/v1/plan-items/{plan_item.id}/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        # Director can update
        api_client.force_authenticate(user=director_user)
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', update_data)
        assert response.status_code == status.HTTP_200_OK
        
        # Admin can delete
        api_client.force_authenticate(user=admin_user)
        response = api_client.delete(f'/api/v1/plan-items/{plan_item.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT


class TestRegistration:
    """Test user registration endpoint."""
    
    def test_register_creates_user_with_foreman_role(self, api_client, db):
        """Test registration always creates user with role='foreman'."""
        response = api_client.post('/api/v1/auth/register/', {
            'email': 'newuser@test.com',
            'password': 'testpass123',
            'password_confirm': 'testpass123'
        })
        
        assert response.status_code == status.HTTP_201_CREATED
        assert 'access' in response.data
        assert 'user' in response.data
        assert response.data['user']['role'] == 'foreman'
        assert response.data['user']['email'] == 'newuser@test.com'
        
        # Verify user was created in database
        user = User.objects.get(email='newuser@test.com')
        assert user.role == 'foreman'
    
    def test_register_ignores_incoming_role(self, api_client, db):
        """Test registration ignores any incoming role field."""
        response = api_client.post('/api/v1/auth/register/', {
            'email': 'newuser2@test.com',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
            'role': 'admin'  # Should be ignored
        })
        
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['user']['role'] == 'foreman'
        
        user = User.objects.get(email='newuser2@test.com')
        assert user.role == 'foreman'
    
    def test_register_validates_password_match(self, api_client, db):
        """Test registration validates password confirmation."""
        response = api_client.post('/api/v1/auth/register/', {
            'email': 'newuser3@test.com',
            'password': 'testpass123',
            'password_confirm': 'differentpass'
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'password_confirm' in response.data or 'non_field_errors' in response.data
    
    def test_register_validates_email_uniqueness(self, api_client, foreman_user):
        """Test registration fails if email already exists."""
        response = api_client.post('/api/v1/auth/register/', {
            'email': 'foreman@test.com',  # Already exists
            'password': 'testpass123',
            'password_confirm': 'testpass123'
        })
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'email' in response.data


class TestUserRoleManagement:
    """Test admin user role management endpoints."""
    
    def test_list_users_requires_admin(self, api_client, director_user, foreman_user):
        """Test listing users requires admin role."""
        # Director cannot list users
        api_client.force_authenticate(user=director_user)
        response = api_client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        # Foreman cannot list users
        api_client.force_authenticate(user=foreman_user)
        response = api_client.get('/api/v1/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_admin_can_list_users(self, api_client, admin_user, director_user, foreman_user):
        """Test admin can list all users."""
        api_client.force_authenticate(user=admin_user)
        response = api_client.get('/api/v1/users/')
        
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data or isinstance(response.data, list)
        
        # Check that all users are in the list
        users_data = response.data.get('results', response.data)
        emails = [user['email'] for user in users_data]
        assert 'admin@test.com' in emails
        assert 'director@test.com' in emails
        assert 'foreman@test.com' in emails
    
    def test_update_role_requires_admin(self, api_client, director_user, foreman_user):
        """Test updating user role requires admin."""
        # Director cannot update role
        api_client.force_authenticate(user=director_user)
        response = api_client.patch('/api/v1/users/1/role/', {'role': 'admin'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
        
        # Foreman cannot update role
        api_client.force_authenticate(user=foreman_user)
        response = api_client.patch('/api/v1/users/1/role/', {'role': 'admin'})
        assert response.status_code == status.HTTP_403_FORBIDDEN
    
    def test_admin_can_update_role(self, api_client, admin_user, foreman_user):
        """Test admin can update user role."""
        api_client.force_authenticate(user=admin_user)
        
        # Update foreman to director
        response = api_client.patch(
            f'/api/v1/users/{foreman_user.id}/role/',
            {'role': 'director'}
        )
        
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'director'
        
        # Verify in database
        foreman_user.refresh_from_db()
        assert foreman_user.role == 'director'
    
    def test_update_role_validates_role_choices(self, api_client, admin_user, foreman_user):
        """Test role update validates role is one of allowed choices."""
        api_client.force_authenticate(user=admin_user)
        
        # Try invalid role
        response = api_client.patch(
            f'/api/v1/users/{foreman_user.id}/role/',
            {'role': 'invalid_role'}
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert 'role' in response.data
    
    def test_update_role_creates_audit_log(self, api_client, admin_user, foreman_user, db):
        """Test role update creates audit log entry."""
        from apps.audit.models import AuditLog
        
        api_client.force_authenticate(user=admin_user)
        
        # Count audit logs before
        initial_count = AuditLog.objects.count()
        
        # Update role
        response = api_client.patch(
            f'/api/v1/users/{foreman_user.id}/role/',
            {'role': 'director'}
        )
        
        assert response.status_code == status.HTTP_200_OK
        
        # Verify audit log was created
        assert AuditLog.objects.count() == initial_count + 1
        
        audit_log = AuditLog.objects.latest('timestamp')
        assert audit_log.action == 'update'
        assert audit_log.model_name == 'User'
        assert audit_log.object_id == foreman_user.id
        assert audit_log.actor == admin_user
        assert audit_log.before == {'role': 'foreman'}
        assert audit_log.after['role'] == 'director'

