"""
Planning permissions.
"""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from apps.projects.models import ProjectAssignment
from apps.finance.constants import ADMIN_ONLY_MSG


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


def _foreman_assigned_to_project(user, project):
    """Check if foreman is assigned to project."""
    if not project:
        return False
    return ProjectAssignment.objects.filter(
        project=project,
        prorab=user
    ).exists()


def _foreman_can_see_actual_expense(user, actual_expense):
    """Check if foreman can see actual expense (project fund_kind and assigned)."""
    if not actual_expense.finance_period or actual_expense.finance_period.fund_kind != 'project':
        return False
    return _foreman_assigned_to_project(user, actual_expense.finance_period.project)


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
        
        # Foreman: read-only (SAFE_METHODS only) AND can only see expenses for projects assigned to that foreman
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
        
        # Action POST (submit/approve/lock): admin only
        if request.method == 'POST' and hasattr(view, 'action') and view.action in ('submit', 'approve', 'lock', 'unlock'):
            return _is_admin(request.user)
        
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
        
        # Action POST (submit/approve/lock): admin only
        if request.method == 'POST' and hasattr(view, 'action') and view.action in ('submit', 'approve', 'lock', 'unlock'):
            return _is_admin(request.user)
        
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


class ProrabPlanPermission(permissions.BasePermission):
    """Permission for ProrabPlan operations - foreman can only access assigned projects."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Only foreman can access prorab endpoints
        if request.user.role != 'foreman':
            return False
        
        # Read operations: foreman can access assigned projects
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Write operations: check in has_object_permission
        return True
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check for prorab plans."""
        from apps.projects.models import ProjectAssignment
        
        # Read: foreman can access if assigned to project
        if request.method in permissions.SAFE_METHODS:
            # Check if prorab is assigned to the project
            period = getattr(obj, 'period', None)
            if not period:
                # For plan items, get period through plan
                plan = getattr(obj, 'plan', None)
                if plan:
                    period = plan.period
                else:
                    return False
            
            project = period.project
            is_assigned = ProjectAssignment.objects.filter(
                project=project,
                prorab=request.user
            ).exists()
            return is_assigned
        
        # Write operations: only when period is OPEN and plan status is DRAFT or REJECTED
        period = getattr(obj, 'period', None)
        if not period:
            plan = getattr(obj, 'plan', None)
            if plan:
                period = plan.period
                plan_obj = plan
            else:
                return False
        else:
            plan_obj = obj
        
        # Check assignment
        project = period.project
        is_assigned = ProjectAssignment.objects.filter(
            project=project,
            prorab=request.user
        ).exists()
        
        if not is_assigned:
            return False
        
        # Check period status (must be OPEN)
        if period.status != 'open':
            return False
        
        # Check plan status (must be DRAFT or REJECTED for editing)
        if plan_obj.status not in ('draft', 'rejected'):
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

