"""
Projects API serializers.
"""
from rest_framework import serializers
from django.contrib.auth import get_user_model
from ..models import Project, ProjectAssignment

User = get_user_model()


class ProjectSerializer(serializers.ModelSerializer):
    """Serializer for Project."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    prorab_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    assigned_prorab_id = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = Project
        fields = [
            'id', 'name', 'description', 'status',
            'created_by', 'created_by_username',
            'prorab_id', 'assigned_prorab_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def validate_prorab_id(self, value):
        """Validate prorab_id refers to a foreman user."""
        if value is None:
            return value
        
        try:
            user = User.objects.get(pk=value)
        except User.DoesNotExist:
            raise serializers.ValidationError(f"User with ID {value} does not exist.")
        
        if user.role != 'foreman':
            raise serializers.ValidationError(f"User {user.email} is not a foreman.")
        
        return value
    
    def get_assigned_prorab_id(self, obj):
        """Get assigned prorab ID for this project."""
        assignment = ProjectAssignment.objects.filter(project=obj).first()
        return assignment.prorab_id if assignment else None

