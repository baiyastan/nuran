"""
Budgeting permissions.
"""
from rest_framework import permissions
from apps.projects.models import ProjectAssignment


class BudgetPlanPermission(permissions.BasePermission):
    """Permission for BudgetPlan operations."""
    
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
        
        # Foreman: read access to assigned projects, can create/update when conditions met
        if user_role == 'foreman':
            if request.method in permissions.SAFE_METHODS:
                return True
            # Foreman can create/update plans (validated in view)
            if request.method in ('POST', 'PUT', 'PATCH'):
                return True
            # Foreman cannot delete plans
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
        
        # Foreman: can see and update plans for assigned projects when status is OPEN
        if user_role == 'foreman':
            # Check if foreman is assigned to the project
            if obj.project:
                is_assigned = ProjectAssignment.objects.filter(
                    project=obj.project,
                    prorab=request.user
                ).exists()
                if not is_assigned:
                    return False
            else:
                # Office/charity plans: foreman cannot see them
                return False
            
            # Read operations: allowed if assigned
            if request.method in permissions.SAFE_METHODS:
                return True
            
            # Update operations: only allowed when plan status is OPEN
            if request.method in ('PUT', 'PATCH'):
                return obj.status == 'OPEN'
            
            # Delete: not allowed
            return False
        
        return False


class BudgetLinePermission(permissions.BasePermission):
    """Permission for BudgetLine operations."""
    
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
        
        # Foreman: can create (with conditions checked in view), read assigned projects
        if user_role == 'foreman':
            if request.method in permissions.SAFE_METHODS:
                return True
            if request.method == 'POST':
                return True  # Will be validated in view
            # Update/delete: admin only
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
        
        # Admin: full access (can edit/delete regardless of plan status)
        if user_role == 'admin':
            return True
        
        # Foreman: can read and update/delete when plan status is OPEN and assigned
        if user_role == 'foreman':
            # Check if foreman is assigned to the plan's project
            if obj.plan.project:
                is_assigned = ProjectAssignment.objects.filter(
                    project=obj.plan.project,
                    prorab=request.user
                ).exists()
                if not is_assigned:
                    return False
            else:
                return False
            
            # Read operations: allowed if assigned
            if request.method in permissions.SAFE_METHODS:
                return True
            
            # Update/delete operations: only allowed when plan status is OPEN
            if request.method in ('PUT', 'PATCH', 'DELETE'):
                return obj.plan.status == 'OPEN'
            
            return False
        
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
        
        # Foreman: read-only, only for assigned project plans
        if user_role == 'foreman':
            return request.method in permissions.SAFE_METHODS
        
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
        
        # Foreman: read-only, only for assigned project plans
        if user_role == 'foreman':
            # Check if foreman is assigned to the plan's project
            if obj.plan.project:
                is_assigned = ProjectAssignment.objects.filter(
                    project=obj.plan.project,
                    prorab=request.user
                ).exists()
                if not is_assigned:
                    return False
            else:
                # Office/charity plans: foreman cannot see them
                return False
            
            # Read operations: allowed if assigned
            return request.method in permissions.SAFE_METHODS
        
        return False

