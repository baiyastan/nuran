"""Permissions for barter-cars admin-only surface."""
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Only users with role='admin' may access barter-car endpoints."""

    message = 'Only admin users can access barter cars.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'admin'
        )
