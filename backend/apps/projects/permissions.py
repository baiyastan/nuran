"""
Project permissions.
"""
from rest_framework import permissions
from core.permissions import IsDirector


class ProjectPermission(permissions.BasePermission):
    """Permission for Project operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # DELETE: admin only
        if request.method == 'DELETE':
            return request.user.role == 'admin'
        
        # Other methods: director and admin
        return IsDirector().has_permission(request, view)

