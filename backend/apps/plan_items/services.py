"""
PlanItem services.
"""
from core.exceptions import InvalidApprovalStage
from apps.audit.services import AuditLogService
from .repositories import PlanItemRepository


class PlanItemService:
    """Service for PlanItem business logic."""
    
    def __init__(self):
        self.repository = PlanItemRepository()
        self.audit_service = AuditLogService()
    
    def create(self, user, **data):
        """Create a new plan item."""
        # Foreman creates with pending status and foreman approval stage
        if user.role == 'foreman':
            data['status'] = 'pending'
            data['approval_stage'] = 'foreman'
        
        data['created_by'] = user
        plan_item = self.repository.create(**data)
        
        # Audit log
        self.audit_service.log_action(
            user=user,
            action='create',
            model_name='PlanItem',
            object_id=plan_item.id,
            changes={
                'name': plan_item.name,
                'status': plan_item.status,
                'approval_stage': plan_item.approval_stage,
                'plan_id': plan_item.plan_id
            }
        )
        
        return plan_item
    
    def update(self, plan_item, user, **data):
        """Update a plan item."""
        old_data = {
            'name': plan_item.name,
            'status': plan_item.status,
            'approval_stage': plan_item.approval_stage,
            'description': plan_item.description
        }
        
        self.repository.update(plan_item, **data)
        plan_item.refresh_from_db()
        
        # Audit log
        changes = {k: {'old': old_data.get(k), 'new': getattr(plan_item, k)} 
                   for k in data.keys() if old_data.get(k) != getattr(plan_item, k)}
        
        if changes:
            self.audit_service.log_action(
                user=user,
                action='update',
                model_name='PlanItem',
                object_id=plan_item.id,
                changes=changes
            )
        
        return plan_item
    
    def approve(self, plan_item, user):
        """Approve a plan item (multi-stage approval)."""
        current_stage = plan_item.approval_stage
        user_role = user.role
        
        # Validate approval stage transition
        if current_stage == 'foreman':
            if user_role not in ('director', 'admin'):
                raise InvalidApprovalStage("Only director or admin can approve from foreman stage")
            plan_item.approval_stage = 'director'
            plan_item.status = 'pending'  # Still pending until admin approval
        
        elif current_stage == 'director':
            if user_role != 'admin':
                raise InvalidApprovalStage("Only admin can approve from director stage")
            plan_item.approval_stage = 'admin'
            plan_item.status = 'approved'  # Final approval
        
        elif current_stage == 'admin':
            raise InvalidApprovalStage("Plan item is already fully approved")
        
        plan_item.save()
        
        # Audit log
        self.audit_service.log_action(
            user=user,
            action='approve',
            model_name='PlanItem',
            object_id=plan_item.id,
            changes={
                'approval_stage': {'old': current_stage, 'new': plan_item.approval_stage},
                'status': {'old': 'pending', 'new': plan_item.status}
            }
        )
        
        return plan_item
    
    def delete(self, plan_item, user):
        """Delete a plan item."""
        plan_item_id = plan_item.id
        plan_item_name = plan_item.name
        
        self.repository.delete(plan_item)
        
        # Audit log
        self.audit_service.log_action(
            user=user,
            action='delete',
            model_name='PlanItem',
            object_id=plan_item_id,
            changes={'name': plan_item_name}
        )

