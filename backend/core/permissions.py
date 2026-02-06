"""
Base RBAC permissions.
"""
from rest_framework import permissions


class IsAdmin(permissions.BasePermission):
    """Admin only permission."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Superuser override for Django admin access
        if request.user.is_superuser:
            return True
        # Role-based access
        return request.user.role == 'admin'


class IsDirector(permissions.BasePermission):
    """Director or Admin permission."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Superuser override for Django admin access
        if request.user.is_superuser:
            return True
        # Role-based access
        return request.user.role in ('director', 'admin')


class IsForeman(permissions.BasePermission):
    """Foreman, Director, or Admin permission."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        # Superuser override for Django admin access
        if request.user.is_superuser:
            return True
        # Role-based access
        return request.user.role in ('foreman', 'director', 'admin')


class IsForemanReadOnly(permissions.BasePermission):
    """Foreman can only create (POST), no update/delete."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override for Django admin access
        if request.user.is_superuser:
            return True
        
        # Allow all authenticated users to read
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Foreman can only POST (create)
        if request.method == 'POST':
            return request.user.role in ('foreman', 'director', 'admin')
        
        # Update/Delete requires director or admin
        return request.user.role in ('director', 'admin')

