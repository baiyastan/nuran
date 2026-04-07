"""
Planning permissions.
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from apps.finance.constants import ADMIN_ONLY_MSG

from .models import PlanPeriod, ProrabPlan, ProrabPlanItem
from .services import is_plan_period_editable


# Helper functions
def _is_safe(request):
    """Check if request method is safe (read-only)."""
    return request.method in permissions.SAFE_METHODS


def _deny():
    """Raise PermissionDenied with admin-only message."""
    raise PermissionDenied(ADMIN_ONLY_MSG)


def _is_admin(user):
    """Check if user is admin or superuser."""
    return user.role == 'admin' or getattr(user, 'is_superuser', False)


def _is_director(user):
    """Check if user is director."""
    return user.role == 'director'


def _is_foreman(user):
    """Check if user is foreman."""
    return user.role == 'foreman'


def _foreman_can_see_actual_expense(user, actual_expense):
    """Foreman may read planning actuals tied to project finance periods only."""
    return (
        actual_expense.finance_period is not None
        and actual_expense.finance_period.fund_kind == 'project'
    )


class ActualExpensePermission(permissions.BasePermission):
    """Permission for ActualExpense operations."""
    
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
        
        # Foreman: read-only; project fund_kind only
        if _is_foreman(request.user):
            if _is_safe(request):
                return _foreman_can_see_actual_expense(request.user, obj)
            _deny()
        
        _deny()


class PlanPeriodPermission(permissions.BasePermission):
    """Permission for PlanPeriod operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Workflow action POST permissions (reads unchanged).
        if request.method == 'POST' and hasattr(view, 'action'):
            action = view.action
            if action == 'submit':
                return request.user.role in ('foreman', 'admin')
            if action == 'approve':
                return request.user.role in ('director', 'admin')
            if action in ('lock', 'unlock'):
                return _is_admin(request.user)
            if action == 'return_to_draft':
                return request.user.role in ('director', 'admin')
        
        # Regular POST (create): foreman, admin (director is read-only)
        if request.method == 'POST':
            return request.user.role in ('foreman', 'admin')
        
        # Update/Delete: foreman (object-level check in viewset), director, admin
        return request.user.role in ('foreman', 'director', 'admin')
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Workflow action POST object-level permissions.
        if request.method == 'POST' and hasattr(view, 'action'):
            action = view.action
            if action == 'submit':
                return request.user.role in ('foreman', 'admin')
            if action == 'approve':
                return request.user.role in ('director', 'admin')
            if action in ('lock', 'unlock'):
                return _is_admin(request.user)
            if action == 'return_to_draft':
                return request.user.role in ('director', 'admin')
        
        # Regular POST (create): foreman, admin (director is read-only)
        if request.method == 'POST':
            return request.user.role in ('foreman', 'admin')
        
        # Update/Delete: foreman (object-level check in viewset), director, admin
        return request.user.role in ('foreman', 'director', 'admin')


class PlanItemPermission(permissions.BasePermission):
    """Permission for PlanItem operations - foreman append-only."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Create: foreman, admin (director is read-only)
        if request.method == 'POST':
            return request.user.role in ('foreman', 'admin')
        
        # Update: foreman, admin, and director (status-based restrictions enforced in has_object_permission)
        if request.method in ('PUT', 'PATCH'):
            return request.user.role in ('foreman', 'admin', 'director')
        
        # Delete: admin only
        if request.method == 'DELETE':
            return request.user.role == 'admin'
        
        # Other methods: director, admin
        return request.user.role in ('director', 'admin')
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Read: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Update: foreman, admin, and director (when plan period status is 'draft' or 'open')
        if request.method in ('PUT', 'PATCH'):
            if request.user.role in ('foreman', 'admin'):
                return True
            # Director can modify when plan period status is 'draft' or 'open' (legacy alias)
            if request.user.role == 'director':
                status = obj.plan_period.status
                return status in ('draft', 'open')
            return False
        
        # Delete: admin only
        if request.method == 'DELETE':
            return request.user.role == 'admin'
        
        # Other methods: admin only
        return request.user.role == 'admin'


def _resolve_prorab_permission_period_and_plan(obj):
    """Return (plan_period, prorab_plan_or_none). prorab_plan is None when obj is only PlanPeriod."""
    if isinstance(obj, PlanPeriod):
        return obj, None
    if isinstance(obj, ProrabPlan):
        return obj.period, obj
    if isinstance(obj, ProrabPlanItem):
        return obj.plan.period, obj.plan
    return None, None


class ProrabPlanPermission(permissions.BasePermission):
    """Prorab API: foreman only; project scope without ProjectAssignment; month/plan rules in views/services."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role != 'foreman':
            return False
        return True

    def has_object_permission(self, request, view, obj):
        if not request.user or request.user.role != 'foreman':
            return False

        period, prorab_plan = _resolve_prorab_permission_period_and_plan(obj)
        if period is None or period.fund_kind != 'project' or not period.project_id:
            return False

        if request.method in permissions.SAFE_METHODS:
            return True

        if not is_plan_period_editable(period):
            return False

        if prorab_plan is not None:
            if prorab_plan.status not in ('draft', 'rejected'):
                return False
        else:
            if period.status not in ('draft', 'open'):
                return False

        return True


class ExpensePermission(permissions.BasePermission):
    """Permission for Expense operations."""
    
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
        
        _deny()

