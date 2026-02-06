"""
Planning permissions.
"""
from rest_framework import permissions
from core.permissions import IsAdmin, IsDirector, IsForeman


class ActualExpensePermission(permissions.BasePermission):
    """Permission for ActualExpense operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Admin and director: full CRUD
        if request.user.role in ('admin', 'director'):
            return True
        
        # Prorab: read-only (GET only)
        if request.user.role == 'foreman':
            return request.method in permissions.SAFE_METHODS
        
        # Others: no access
        return False
    
    def has_object_permission(self, request, view, obj):
        """Object-level permission check."""
        # Admin and director: full access
        if request.user.role in ('admin', 'director'):
            return True
        
        # Prorab: can only read expenses linked to their own plans
        if request.user.role == 'foreman':
            if request.method in permissions.SAFE_METHODS:
                # Can only see if expense is linked to their plan
                if obj.prorab_plan and obj.prorab_plan.prorab == request.user:
                    # Also check that project is not Office (prorab should not see Office expenses)
                    if obj.project.name.lower() != 'office':
                        return True
            return False
        
        return False


class PlanPeriodPermission(permissions.BasePermission):
    """Permission for PlanPeriod operations."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Create: foreman, director, admin
        if request.method == 'POST':
            return request.user.role in ('foreman', 'director', 'admin')
        
        # Update/Delete: director, admin only
        return request.user.role in ('director', 'admin')


class PlanItemPermission(permissions.BasePermission):
    """Permission for PlanItem operations - foreman append-only."""
    
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        
        # Read operations: all authenticated users
        if request.method in permissions.SAFE_METHODS:
            return True
        
        # Create: foreman, director, admin
        if request.method == 'POST':
            return request.user.role in ('foreman', 'director', 'admin')
        
        # Update: director, admin only (foreman cannot)
        if request.method in ('PUT', 'PATCH'):
            return request.user.role in ('director', 'admin')
        
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
        
        # Foreman cannot update/delete (append-only)
        if request.user.role == 'foreman':
            return False
        
        # Delete: admin only
        if request.method == 'DELETE':
            return request.user.role == 'admin'
        
        # Update: director and admin can update
        return request.user.role in ('director', 'admin')


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

