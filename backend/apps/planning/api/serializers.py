"""
Planning API serializers.
"""
from rest_framework import serializers
from ..models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense
from apps.projects.models import ProjectAssignment
from apps.projects.api.serializers import ProjectSerializer


class PlanPeriodSerializer(serializers.ModelSerializer):
    """Serializer for PlanPeriod."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    
    class Meta:
        model = PlanPeriod
        fields = [
            'id', 'project', 'project_name', 'period', 'status',
            'submitted_at', 'approved_at', 'locked_at', 'comments',
            'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'status', 'submitted_at', 'approved_at', 'locked_at',
            'created_by', 'created_at', 'updated_at'
        ]


class PlanItemSerializer(serializers.ModelSerializer):
    """Serializer for PlanItem."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    plan_period_period = serializers.CharField(source='plan_period.period', read_only=True)
    project_name = serializers.CharField(source='plan_period.project.name', read_only=True)
    
    class Meta:
        model = PlanItem
        fields = [
            'id', 'plan_period', 'plan_period_period', 'project_name',
            'title', 'category', 'qty', 'unit', 'amount', 'note',
            'created_by', 'created_by_username', 'created_at'
        ]
        read_only_fields = ['created_by', 'created_at']


class ProjectAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for ProjectAssignment."""
    
    project_name = serializers.CharField(source='project.name', read_only=True)
    prorab_email = serializers.CharField(source='prorab.email', read_only=True)
    
    class Meta:
        model = ProjectAssignment
        fields = ['id', 'project', 'project_name', 'prorab', 'prorab_email', 'assigned_at']
        read_only_fields = ['assigned_at']


class ProrabProjectSerializer(ProjectSerializer):
    """Serializer for Project in prorab context - includes assigned_at."""
    
    assigned_at = serializers.SerializerMethodField()
    
    class Meta(ProjectSerializer.Meta):
        fields = ProjectSerializer.Meta.fields + ['assigned_at']
    
    def get_assigned_at(self, obj):
        """Get assigned_at from ProjectAssignment for the current user."""
        request = self.context.get('request')
        if not request or not request.user:
            return None
        
        # Get assignment for this project and current user
        assignment = ProjectAssignment.objects.filter(
            project=obj,
            prorab=request.user
        ).first()
        
        if assignment and assignment.assigned_at:
            return assignment.assigned_at.isoformat()
        return None


class ProrabPlanPeriodSerializer(serializers.ModelSerializer):
    """Serializer for PlanPeriod in prorab context."""
    
    project_name = serializers.CharField(source='project.name', read_only=True)
    
    class Meta:
        model = PlanPeriod
        fields = [
            'id', 'project', 'project_name', 'period', 'status',
            'limit_amount', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class ProrabPlanItemSerializer(serializers.ModelSerializer):
    """Serializer for ProrabPlanItem."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    
    class Meta:
        model = ProrabPlanItem
        fields = [
            'id', 'plan', 'category', 'category_name', 'name', 'amount',
            'created_by', 'created_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def validate_category(self, value):
        """Validate category field - must be subcategory with parent != null, scope = project."""
        if not value:
            raise serializers.ValidationError("Category is required.")
        
        if not value.is_active:
            raise serializers.ValidationError("Category is not active.")
        
        if value.scope != 'project':
            raise serializers.ValidationError("Category scope must be 'project'.")
        
        if value.parent is None:
            raise serializers.ValidationError("Category must be a subcategory (must have a parent).")
        
        return value
    
    def validate_name(self, value):
        """Validate name field."""
        if len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters long.")
        return value.strip()
    
    def validate_amount(self, value):
        """Validate amount field."""
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive number.")
        return value


class ProrabPlanSerializer(serializers.ModelSerializer):
    """Serializer for ProrabPlan."""
    
    period_period = serializers.CharField(source='period.period', read_only=True)
    period_status = serializers.CharField(source='period.status', read_only=True)
    project_name = serializers.CharField(source='period.project.name', read_only=True)
    limit_amount = serializers.DecimalField(source='period.limit_amount', max_digits=12, decimal_places=2, read_only=True, allow_null=True)
    items = ProrabPlanItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = ProrabPlan
        fields = [
            'id', 'period', 'period_period', 'period_status', 'project_name',
            'prorab', 'status', 'total_amount', 'limit_amount',
            'submitted_at', 'approved_at', 'rejected_at', 'comments',
            'items', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'prorab', 'total_amount', 'submitted_at', 'approved_at',
            'rejected_at', 'created_at', 'updated_at'
        ]


class ActualExpenseSerializer(serializers.ModelSerializer):
    """Serializer for ActualExpense."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True)
    period_period = serializers.CharField(source='period.period', read_only=True, allow_null=True)
    prorab_plan_id = serializers.IntegerField(source='prorab_plan.id', read_only=True, allow_null=True)
    prorab_plan_item_id = serializers.IntegerField(source='prorab_plan_item.id', read_only=True, allow_null=True)
    category_id = serializers.IntegerField(source='category.id', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = ActualExpense
        fields = [
            'id', 'project', 'project_name', 'period', 'period_period',
            'prorab_plan', 'prorab_plan_id', 'prorab_plan_item', 'prorab_plan_item_id',
            'category', 'category_id', 'category_name',
            'name', 'amount', 'spent_at', 'comment', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def validate_name(self, value):
        """Validate name field."""
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters long.")
        return value.strip()
    
    def validate_amount(self, value):
        """Validate amount field."""
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive number.")
        return value
    
    def validate_comment(self, value):
        """Validate comment field - must not be empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Comment is required and cannot be empty.")
        return value.strip()


class ProrabPlanSummarySerializer(serializers.Serializer):
    """Serializer for prorab plan summary (totals)."""
    
    plan_id = serializers.IntegerField()
    planned_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    spent_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2)


class ProrabPlanExpenseSerializer(serializers.ModelSerializer):
    """Read-only serializer for actual expenses in prorab context."""
    
    class Meta:
        model = ActualExpense
        fields = [
            'id', 'name', 'amount', 'spent_at', 'created_at'
        ]
        read_only_fields = ['id', 'name', 'amount', 'spent_at', 'created_at']

