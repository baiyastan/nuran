"""
Actuals API serializers.
"""
from rest_framework import serializers
from ..models import ActualItem


class ActualItemSerializer(serializers.ModelSerializer):
    """Serializer for ActualItem."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    plan_period_period = serializers.CharField(source='plan_period.period', read_only=True)
    project_name = serializers.CharField(source='plan_period.project.name', read_only=True)
    
    class Meta:
        model = ActualItem
        fields = [
            'id', 'plan_period', 'plan_period_period', 'project_name',
            'title', 'category', 'qty', 'unit', 'amount', 'note',
            'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

