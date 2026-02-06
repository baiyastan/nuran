"""
PlanItem permissions.
"""
from rest_framework import permissions
from core.permissions import IsForemanReadOnly, IsDirector, IsAdmin


class PlanItemPermission(permissions.BasePermission):
    """Permission for PlanItem operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Create: foreman, director, admin
        if request.method == 'POST':
            return request.user.role in ('foreman', 'director', 'admin')
        
        # Update/Delete: director, admin only
        return request.user.role in ('director', 'admin')
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Read: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Foreman cannot update/delete
        if request.user.role == 'foreman':
            return False
        
        # Director and admin can update/delete
        return request.user.role in ('director', 'admin')


class PlanItemApprovePermission(permissions.BasePermission):
    """Permission for PlanItem approval."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Only director and admin can approve
        return request.user.role in ('director', 'admin')

