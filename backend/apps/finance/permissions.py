"""
Finance permissions.
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from .constants import ADMIN_ONLY_MSG


# Helper functions
def _is_safe(request):
    """Check if request method is safe (read-only)."""
    return request.method in permissions.SAFE_METHODS


def _deny():
    """Raise PermissionDenied with admin-only message."""
    raise PermissionDenied(ADMIN_ONLY_MSG)


def _is_admin(user):
    """Check if user is admin."""
    return user.role == 'admin'


def _is_director(user):
    """Check if user is director."""
    return user.role == 'director'


def _is_foreman(user):
    """Check if user is foreman."""
    return user.role == 'foreman'


def _foreman_can_see_finance_period(user, finance_period):
    """Foreman may read project-scoped finance periods only (no assignment check)."""
    return finance_period.fund_kind == 'project'


def _foreman_can_see_income_entry(user, income_entry):
    """Foreman may read income on project fund_kind only (no assignment check)."""
    return income_entry.finance_period.fund_kind == 'project'


class FinancePeriodPermission(permissions.BasePermission):
    """Permission for FinancePeriod operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Admin: full CRUD
        if _is_admin(request.user):
            return True
        
        # Director: read-only (SAFE_METHODS only)
        if _is_director(request.user):
            if _is_safe(request):
                return True
            _deny()
        
        # Foreman: read-only (SAFE_METHODS only)
        if _is_foreman(request.user):
            if _is_safe(request):
                return True
            _deny()
        
        # Others: no access
        _deny()
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Admin: full access
        if _is_admin(request.user):
            return True
        
        # Director: read-only (SAFE_METHODS only)
        if _is_director(request.user):
            if _is_safe(request):
                return True
            _deny()
        
        # Foreman: read-only; project fund_kind only (all projects)
        if _is_foreman(request.user):
            if _is_safe(request):
                return _foreman_can_see_finance_period(request.user, obj)
            _deny()
        
        _deny()


class IncomeEntryPermission(permissions.BasePermission):
    """IncomeEntry: admin writes facts; director read-only; foreman read-only on project fund_kind (all projects)."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        u = request.user
        if getattr(u, 'is_superuser', False):
            return True
        if _is_admin(u):
            return True
        if _is_director(u):
            return _is_safe(request)
        if _is_foreman(u):
            return _is_safe(request)
        _deny()

    def has_object_permission(self, request, view, obj):
        u = request.user
        if not (u and u.is_authenticated):
            return False
        if getattr(u, 'is_superuser', False):
            return True
        if _is_admin(u):
            return True
        if _is_director(u):
            if not _is_safe(request):
                return False
            return True
        if _is_foreman(u):
            if not _is_safe(request):
                return False
            return _foreman_can_see_income_entry(u, obj)
        _deny()


class IncomeSourcePermission(permissions.BasePermission):
    """Permission for IncomeSource operations - admin and director only."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Admin: full CRUD
        if _is_admin(request.user):
            return True
        
        # Director: full CRUD
        if _is_director(request.user):
            return True
        
        # Foreman: 403
        if _is_foreman(request.user):
            _deny()
        
        # Others: no access
        _deny()
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        return self.has_permission(request, view)


class IncomePlanPermission(permissions.BasePermission):
    """Permission for IncomePlan operations - admin and director only."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Admin: full CRUD
        if _is_admin(request.user):
            return True
        
        # Director: full CRUD
        if _is_director(request.user):
            return True
        
        # Foreman: 403
        if _is_foreman(request.user):
            _deny()
        
        # Others: no access
        _deny()
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        return self.has_permission(request, view)


class TransferPermission(permissions.BasePermission):
    """Transfer (posted fact): admin may write; director read-only; others denied."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        u = request.user
        if getattr(u, 'is_superuser', False):
            return True
        if _is_admin(u):
            return True
        if _is_director(u):
            return _is_safe(request)
        _deny()

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class CurrencyExchangePermission(permissions.BasePermission):
    """Currency exchange (posted fact): admin may write; director read-only; others denied."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        u = request.user
        if getattr(u, 'is_superuser', False):
            return True
        if _is_admin(u):
            return True
        if _is_director(u):
            return _is_safe(request)
        _deny()

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)
