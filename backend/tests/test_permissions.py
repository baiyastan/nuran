"""
Tests for permissions.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from core.permissions import IsAdmin, IsDirector, IsForeman, IsForemanReadOnly

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


class TestIsAdmin:
    """Test IsAdmin permission."""
    
    def test_admin_has_permission(self, admin_user):
        """Admin should have permission."""
        permission = IsAdmin()
        request = type('Request', (), {'user': admin_user})()
        assert permission.has_permission(request, None) is True
    
    def test_director_no_permission(self, director_user):
        """Director should not have permission."""
        permission = IsAdmin()
        request = type('Request', (), {'user': director_user})()
        assert permission.has_permission(request, None) is False
    
    def test_foreman_no_permission(self, foreman_user):
        """Foreman should not have permission."""
        permission = IsAdmin()
        request = type('Request', (), {'user': foreman_user})()
        assert permission.has_permission(request, None) is False


class TestIsDirector:
    """Test IsDirector permission."""
    
    def test_admin_has_permission(self, admin_user):
        """Admin should have permission."""
        permission = IsDirector()
        request = type('Request', (), {'user': admin_user})()
        assert permission.has_permission(request, None) is True
    
    def test_director_has_permission(self, director_user):
        """Director should have permission."""
        permission = IsDirector()
        request = type('Request', (), {'user': director_user})()
        assert permission.has_permission(request, None) is True
    
    def test_foreman_no_permission(self, foreman_user):
        """Foreman should not have permission."""
        permission = IsDirector()
        request = type('Request', (), {'user': foreman_user})()
        assert permission.has_permission(request, None) is False


class TestIsForeman:
    """Test IsForeman permission."""
    
    def test_admin_has_permission(self, admin_user):
        """Admin should have permission."""
        permission = IsForeman()
        request = type('Request', (), {'user': admin_user})()
        assert permission.has_permission(request, None) is True
    
    def test_director_has_permission(self, director_user):
        """Director should have permission."""
        permission = IsForeman()
        request = type('Request', (), {'user': director_user})()
        assert permission.has_permission(request, None) is True
    
    def test_foreman_has_permission(self, foreman_user):
        """Foreman should have permission."""
        permission = IsForeman()
        request = type('Request', (), {'user': foreman_user})()
        assert permission.has_permission(request, None) is True


class TestIsForemanReadOnly:
    """Test IsForemanReadOnly permission."""
    
    def test_foreman_can_post(self, foreman_user):
        """Foreman should be able to POST."""
        permission = IsForemanReadOnly()
        request = type('Request', (), {'user': foreman_user, 'method': 'POST'})()
        assert permission.has_permission(request, None) is True
    
    def test_foreman_can_get(self, foreman_user):
        """Foreman should be able to GET."""
        permission = IsForemanReadOnly()
        request = type('Request', (), {'user': foreman_user, 'method': 'GET'})()
        assert permission.has_permission(request, None) is True
    
    def test_foreman_cannot_patch(self, foreman_user):
        """Foreman should not be able to PATCH."""
        permission = IsForemanReadOnly()
        request = type('Request', (), {'user': foreman_user, 'method': 'PATCH'})()
        assert permission.has_permission(request, None) is False
    
    def test_director_can_patch(self, director_user):
        """Director should be able to PATCH."""
        permission = IsForemanReadOnly()
        request = type('Request', (), {'user': director_user, 'method': 'PATCH'})()
        assert permission.has_permission(request, None) is True

