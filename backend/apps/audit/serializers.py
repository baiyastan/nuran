"""
Audit log serializers.
"""
from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for AuditLog."""
    
    user_username = serializers.CharField(source='user.username', read_only=True)
    
    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_username', 'action',
            'model_name', 'object_id', 'changes', 'timestamp'
        ]
        read_only_fields = ['user', 'timestamp']

