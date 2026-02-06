"""
Plan permissions.
"""
from rest_framework import permissions
from core.permissions import IsDirector


class PlanPermission(permissions.BasePermission):
    """Permission for Plan operations."""
    
    def has_permission(self, request, view):
        # Only director and admin can manage plans
        return IsDirector().has_permission(request, view)

