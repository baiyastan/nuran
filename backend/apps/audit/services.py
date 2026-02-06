"""
Audit log services.
"""
import json
from django.core.serializers.json import DjangoJSONEncoder
from .models import AuditLog


class AuditLogService:
    """Service for audit logging."""
    
    @staticmethod
    def log(actor, action, instance, before=None, after=None, object_id_override=None):
        """
        Log an action to audit log.
        
        Args:
            actor: User instance performing the action
            action: Action type (create, update, delete, approve, lock, submit)
            instance: Model instance being acted upon
            before: Dict of state before action (for update/delete)
            after: Dict of state after action (for create/update)
            object_id_override: Optional object_id to use instead of instance.pk
                              (useful when instance is deleted and pk is None)
        """
        model_name = instance.__class__.__name__
        # Use object_id_override if provided, otherwise use instance.pk
        object_id = object_id_override if object_id_override is not None else instance.pk
        
        # Serialize before/after to JSON-safe format
        before_data = None
        after_data = None
        
        if before is not None:
            before_data = json.loads(json.dumps(before, cls=DjangoJSONEncoder))
        
        if after is not None:
            after_data = json.loads(json.dumps(after, cls=DjangoJSONEncoder))
        
        return AuditLog.objects.create(
            actor=actor,
            action=action,
            model_name=model_name,
            object_id=object_id,
            before=before_data,
            after=after_data,
        )
    
    @staticmethod
    def log_create(actor, instance):
        """Log a create action."""
        after = {}
        for field in instance._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(instance, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):  # Foreign key
                        after[field.name] = value.pk
                    else:
                        after[field.name] = value
        return AuditLogService.log(actor, 'create', instance, before=None, after=after)
    
    @staticmethod
    def log_update(actor, instance, before_state):
        """Log an update action."""
        after = {}
        for field in instance._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(instance, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):  # Foreign key
                        after[field.name] = value.pk
                    else:
                        after[field.name] = value
        return AuditLogService.log(actor, 'update', instance, before=before_state, after=after)
    
    @staticmethod
    def log_delete(actor, instance, before_state, object_id_override=None):
        """Log a delete action."""
        return AuditLogService.log(actor, 'delete', instance, before=before_state, after=None, object_id_override=object_id_override)
