"""
Plan services.
"""
from apps.audit.services import AuditLogService
from .repositories import PlanRepository


class PlanService:
    """Service for Plan business logic."""
    
    def __init__(self):
        self.repository = PlanRepository()
        self.audit_service = AuditLogService()
    
    def create(self, user, **data):
        """Create a new plan."""
        data['created_by'] = user
        plan = self.repository.create(**data)
        
        # Audit log
        self.audit_service.log_action(
            user=user,
            action='create',
            model_name='Plan',
            object_id=plan.id,
            changes={'name': plan.name, 'status': plan.status, 'project_id': plan.project_id}
        )
        
        return plan
    
    def update(self, plan, user, **data):
        """Update a plan."""
        old_data = {
            'name': plan.name,
            'status': plan.status,
            'description': plan.description
        }
        
        self.repository.update(plan, **data)
        plan.refresh_from_db()
        
        # Audit log
        changes = {k: {'old': old_data.get(k), 'new': getattr(plan, k)} 
                   for k in data.keys() if old_data.get(k) != getattr(plan, k)}
        
        if changes:
            self.audit_service.log_action(
                user=user,
                action='update',
                model_name='Plan',
                object_id=plan.id,
                changes=changes
            )
        
        return plan
    
    def delete(self, plan, user):
        """Delete a plan."""
        plan_id = plan.id
        plan_name = plan.name
        
        self.repository.delete(plan)
        
        # Audit log
        self.audit_service.log_action(
            user=user,
            action='delete',
            model_name='Plan',
            object_id=plan_id,
            changes={'name': plan_name}
        )

