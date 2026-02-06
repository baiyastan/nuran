"""
Actuals permissions.
"""
from rest_framework import permissions


class ActualItemPermission(permissions.BasePermission):
    """Permission for ActualItem operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # All authenticated users can read and create
        if request.method in permissions.SAFE_METHODS or request.method == 'POST':
            return True
        
        # Update/Delete: director, admin only
        return request.user.role in ('director', 'admin')

