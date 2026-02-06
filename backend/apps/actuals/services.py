"""
Actuals services - business logic layer.
"""
from apps.audit.services import AuditLogService
from .models import ActualItem


class ActualItemService:
    """Service for ActualItem business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new actual item."""
        data['created_by'] = user
        actual_item = ActualItem.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, actual_item)
        
        return actual_item
    
    @staticmethod
    def update(actual_item, user, **data):
        """Update an actual item."""
        before_state = {}
        for field in actual_item._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(actual_item, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        for key, value in data.items():
            setattr(actual_item, key, value)
        actual_item.save()
        
        # Audit log
        AuditLogService.log_update(user, actual_item, before_state)
        
        return actual_item
    
    @staticmethod
    def delete(actual_item, user):
        """Delete an actual item."""
        before_state = {
            'id': actual_item.id,
            'title': actual_item.title,
            'plan_period_id': actual_item.plan_period_id,
        }
        
        actual_item.delete()
        
        # Audit log
        AuditLogService.log_delete(user, actual_item, before_state)

