"""
Budgeting permissions.
"""
from rest_framework import permissions

from .models import BudgetPlan


class IsAdminOrReadOnly(permissions.BasePermission):
    """Admin can write, others read-only."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        # Admin: full CRUD
        if request.user.role == 'admin':
            return True
        
        # Director and Foreman: read-only (SAFE_METHODS only)
        if request.user.role in ('director', 'foreman'):
            return request.method in permissions.SAFE_METHODS
        
        return False


class BudgetPlanPermission(permissions.BasePermission):
    """Permission for BudgetPlan operations.
    
    Foreman: access only for scope=PROJECT. OFFICE/CHARITY remain restricted.
    """
    
    def has_permission(self, request, view):
        """Check if user has permission for the action."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        # Director: read-only access
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        # Admin: full access
        if user_role == 'admin':
            return True
        
        # Foreman: PROJECT scope only, no assignment required
        if user_role == 'foreman':
            if view.action == 'list':
                return request.query_params.get('scope') == 'PROJECT'
            if view.action == 'create':
                return request.data.get('scope') == 'PROJECT'
            if view.action in ('retrieve', 'update', 'partial_update', 'destroy'):
                return True  # has_object_permission will restrict
            return False
        
        return False
    
    def has_object_permission(self, request, view, obj):
        """Check object-level permissions."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        # Director: read-only
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        # Admin: full access
        if user_role == 'admin':
            return True
        
        # Foreman: only PROJECT scope
        if user_role == 'foreman':
            return obj.scope == 'PROJECT'
        
        return False


class BudgetLinePermission(permissions.BasePermission):
    """Permission for BudgetLine operations.
    
    Foreman: access only when plan.scope == 'PROJECT'.
    """
    
    def _get_plan_id(self, request, view):
        """Extract plan ID from request (query or body)."""
        if view.action == 'list':
            val = request.query_params.get('plan')
        elif view.action in ('create', 'bulk_upsert'):
            val = request.data.get('plan')
        else:
            return None
        if val is None:
            return None
        try:
            return int(val)
        except (TypeError, ValueError):
            return None
    
    def _is_project_plan(self, plan_id):
        """Check if plan has scope PROJECT."""
        if plan_id is None:
            return False
        scope = BudgetPlan.objects.filter(pk=plan_id).values_list('scope', flat=True).first()
        return scope == 'PROJECT'
    
    def has_permission(self, request, view):
        """Check if user has permission for the action."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        if user_role == 'admin':
            return True
        
        if user_role == 'foreman':
            if view.action in ('retrieve', 'update', 'partial_update', 'destroy'):
                return True
            if view.action in ('list', 'create', 'bulk_upsert'):
                plan_id = self._get_plan_id(request, view)
                return self._is_project_plan(plan_id)
            return False
        
        return False
    
    def has_object_permission(self, request, view, obj):
        """Check object-level permissions."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        if user_role == 'admin':
            return True
        
        if user_role == 'foreman':
            return obj.plan.scope == 'PROJECT'
        
        return False


class BudgetExpensePermission(permissions.BasePermission):
    """Permission for BudgetExpense operations."""
    
    def has_permission(self, request, view):
        """Check if user has permission for the action."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        # Director: read-only access
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        # Admin: full access (but plan status check happens in serializer)
        if user_role == 'admin':
            return True
        
        # Foreman: no access
        return False
    
    def has_object_permission(self, request, view, obj):
        """Check object-level permissions."""
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        # Director: read-only
        if user_role == 'director':
            return request.method in permissions.SAFE_METHODS
        
        # Admin: full access (but plan status check happens in serializer)
        if user_role == 'admin':
            return True
        
        # Foreman: no access
        return False


class ExpenseCategoryPermission(permissions.BasePermission):
    """Permission for ExpenseCategory operations.
    
    Rules:
    - admin: FULL ACCESS (GET + POST + PATCH + DELETE)
    - director: READ ONLY (GET, HEAD, OPTIONS)
    - foreman: READ ONLY for scope=project (list/retrieve) to select categories for plan lines
    """
    
    def has_permission(self, request, view):
        # 1) If user is not authenticated → deny
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Superuser override
        if request.user.is_superuser:
            return True
        
        user_role = request.user.role
        
        # 2) SAFE METHODS (GET, HEAD, OPTIONS): admin, director, or foreman with scope=project
        if request.method in permissions.SAFE_METHODS:
            if user_role in ('admin', 'director'):
                return True
            if user_role == 'foreman':
                # List: require scope=project in query
                if view.action == 'list':
                    return request.query_params.get('scope') == 'project'
                # Retrieve: allow; has_object_permission will check obj.scope
                if view.action == 'retrieve':
                    return True
                return False
        
        # 3) WRITE METHODS: allow ONLY if role == 'admin'
        return user_role == 'admin'
    
    def has_object_permission(self, request, view, obj):
        """Foreman can only access categories with scope=project."""
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        if request.user.role == 'foreman':
            return request.method in permissions.SAFE_METHODS and obj.scope == 'project'
        return True  # admin/director handled by has_permission

