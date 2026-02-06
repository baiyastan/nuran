"""
PlanItem serializers.
"""
from rest_framework import serializers
from .models import PlanItem


class PlanItemSerializer(serializers.ModelSerializer):
    """Serializer for PlanItem."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    
    class Meta:
        model = PlanItem
        fields = [
            'id', 'plan', 'plan_name', 'name', 'description',
            'quantity', 'unit', 'material', 'cost', 'date',
            'status', 'approval_stage',
            'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'status', 'approval_stage', 'created_at', 'updated_at']

