"""
Finance permissions.
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from apps.projects.models import ProjectAssignment
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


def _foreman_assigned_to_project(user, project):
    """Check if foreman is assigned to project."""
    if not project:
        return False
    return ProjectAssignment.objects.filter(
        project=project,
        prorab=user
    ).exists()


def _foreman_can_see_finance_period(user, finance_period):
    """Check if foreman can see finance period (project fund_kind and assigned)."""
    if finance_period.fund_kind != 'project':
        return False
    return _foreman_assigned_to_project(user, finance_period.project)


def _foreman_can_see_income_entry(user, income_entry):
    """Check if foreman can see income entry (project fund_kind and assigned)."""
    if income_entry.finance_period.fund_kind != 'project':
        return False
    return _foreman_assigned_to_project(user, income_entry.finance_period.project)


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
        
        # Foreman: read-only (SAFE_METHODS only) AND can only see project fund_kind for assigned projects
        if _is_foreman(request.user):
            if _is_safe(request):
                return _foreman_can_see_finance_period(request.user, obj)
            _deny()
        
        _deny()


class IncomeEntryPermission(permissions.BasePermission):
    """Permission for IncomeEntry operations.
    
    Only checks authentication and role-level access.
    Business rules (month lock status) are handled in service layer.
    """
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Admin, director, foreman: allow all operations
        # Business rules (month lock checks) are handled in service layer
        if _is_admin(request.user) or _is_director(request.user) or _is_foreman(request.user):
            return True
        
        # Others: no access
        _deny()
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Admin, director, foreman: allow all operations
        # Business rules (month lock checks) are handled in service layer
        if _is_admin(request.user) or _is_director(request.user) or _is_foreman(request.user):
            # For foreman, check if they can see this entry (project fund_kind and assigned)
            if _is_foreman(request.user):
                return _foreman_can_see_income_entry(request.user, obj)
            return True
        
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
