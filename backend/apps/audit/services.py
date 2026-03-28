"""
Audit log services.
"""
import json
from django.core.serializers.json import DjangoJSONEncoder
from .models import AuditLog

AUDIT_REASON_MAX_LEN = 2000


def optional_audit_reason(request, max_len=AUDIT_REASON_MAX_LEN):
    """Extract optional human-readable reason from request body (DRF request.data)."""
    if request is None or not hasattr(request, 'data'):
        return None
    raw = request.data.get('audit_reason')
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    return s[:max_len]


class AuditLogService:
    """Service for audit logging."""

    @staticmethod
    def _normalize_reason(reason):
        if reason is None:
            return None
        s = str(reason).strip()
        if not s:
            return None
        return s[:AUDIT_REASON_MAX_LEN]

    @staticmethod
    def merge_audit_reason(payload, reason):
        """Attach optional _audit_reason to a before/after dict (no DB schema change)."""
        reason = AuditLogService._normalize_reason(reason)
        if not reason:
            return payload
        if payload is None:
            return {'_audit_reason': reason}
        out = dict(payload)
        out['_audit_reason'] = reason
        return out

    @staticmethod
    def model_field_snapshot(instance):
        """JSON-serializable snapshot of concrete fields (FKs as pk); skips empty values."""
        state = {}
        for field in instance._meta.fields:
            if field.name in ('id', 'created_at', 'updated_at'):
                continue
            value = getattr(instance, field.name, None)
            if value is not None:
                if hasattr(value, 'pk'):
                    state[field.name] = value.pk
                else:
                    state[field.name] = value
        return state

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
    def log_create(actor, instance, reason=None):
        """Log a create action."""
        after = AuditLogService.model_field_snapshot(instance)
        after = AuditLogService.merge_audit_reason(after, reason)
        return AuditLogService.log(actor, 'create', instance, before=None, after=after)
    
    @staticmethod
    def log_update(actor, instance, before_state, reason=None):
        """Log an update action."""
        after = AuditLogService.model_field_snapshot(instance)
        after = AuditLogService.merge_audit_reason(after, reason)
        before_merged = AuditLogService.merge_audit_reason(dict(before_state), None)
        return AuditLogService.log(actor, 'update', instance, before=before_merged, after=after)
    
    @staticmethod
    def log_delete(actor, instance, before_state, object_id_override=None, reason=None):
        """Log a delete action."""
        before_merged = AuditLogService.merge_audit_reason(dict(before_state), reason)
        return AuditLogService.log(
            actor, 'delete', instance, before=before_merged, after=None,
            object_id_override=object_id_override,
        )
