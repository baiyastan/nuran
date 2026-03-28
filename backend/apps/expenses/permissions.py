"""
Expenses API permissions - actual expense.
Admin: full CRUD. Director: read-only. Foreman: read-only for scope=PROJECT (SAFE_METHODS only).
"""
from rest_framework import permissions


def _is_safe(request):
    return request.method in permissions.SAFE_METHODS


def _is_admin(user):
    return getattr(user, 'role', None) == 'admin'


def _is_director(user):
    return getattr(user, 'role', None) == 'director'


def _is_foreman(user):
    return getattr(user, 'role', None) == 'foreman'


class ActualExpensePermission(permissions.BasePermission):
    """Admin: full CRUD. Director: read-only. Foreman: read-only for scope=PROJECT only (SAFE_METHODS)."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        if _is_admin(request.user):
            return True
        if _is_director(request.user):
            return request.method in permissions.SAFE_METHODS
        if _is_foreman(request.user):
            if request.method not in permissions.SAFE_METHODS:
                return False
            if view.kwargs.get('pk'):
                return True
            return request.query_params.get('scope') == 'PROJECT'
        return False

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        if _is_admin(request.user):
            return True
        if _is_director(request.user):
            return request.method in permissions.SAFE_METHODS
        if _is_foreman(request.user):
            return request.method in permissions.SAFE_METHODS and obj.scope == 'PROJECT'
        return False
