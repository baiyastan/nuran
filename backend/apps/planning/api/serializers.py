"""
Planning API serializers.
"""
from rest_framework import serializers
from ..models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense, Expense
from apps.projects.models import ProjectAssignment
from apps.projects.api.serializers import ProjectSerializer


class PlanPeriodSerializer(serializers.ModelSerializer):
    """Serializer for PlanPeriod."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    
    class Meta:
        model = PlanPeriod
        fields = [
            'id', 'fund_kind', 'project', 'project_name', 'period', 'status',
            'submitted_at', 'approved_at', 'locked_at', 'comments',
            'limit_amount', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'status', 'submitted_at', 'approved_at', 'locked_at',
            'created_by', 'created_at', 'updated_at'
        ]
    
    def validate(self, attrs):
        """Validate fund_kind and project relationship."""
        fund_kind = attrs.get('fund_kind', self.instance.fund_kind if self.instance else None)
        project = attrs.get('project', self.instance.project if self.instance else None)
        
        if fund_kind == 'project':
            if not project:
                raise serializers.ValidationError({
                    'project': 'Project is required when fund_kind is "project"'
                })
        elif fund_kind in ('office', 'charity'):
            if project:
                raise serializers.ValidationError({
                    'project': f'Project must be null when fund_kind is "{fund_kind}"'
                })
        
        return attrs


class PlanItemSerializer(serializers.ModelSerializer):
    """Serializer for PlanItem."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    plan_period_period = serializers.CharField(source='plan_period.period', read_only=True)
    project_name = serializers.CharField(source='plan_period.project.name', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = PlanItem
        fields = [
            'id', 'plan_period', 'plan_period_period', 'project_name',
            'title', 'category', 'category_name', 'qty', 'unit', 'amount', 'note',
            'created_by', 'created_by_username', 'created_at'
        ]
        read_only_fields = ['created_by', 'created_at']
    
    def validate(self, attrs):
        """Validate category scope matches plan_period.fund_kind."""
        category = attrs.get('category')
        plan_period = attrs.get('plan_period') or (self.instance.plan_period if self.instance else None)
        
        if category and plan_period:
            if hasattr(category, 'scope'):
                category_obj = category
            else:
                from apps.budgeting.models import ExpenseCategory
                category_obj = ExpenseCategory.objects.get(id=category)
            
            if category_obj.scope != plan_period.fund_kind:
                raise serializers.ValidationError({
                    'category': f"Category scope '{category_obj.scope}' does not match plan_period fund_kind '{plan_period.fund_kind}'"
                })
        return attrs


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
    finance_period_fund_kind = serializers.CharField(source='finance_period.fund_kind', read_only=True, allow_null=True)
    finance_period_month = serializers.CharField(source='finance_period.month_period.month', read_only=True, allow_null=True)
    # project_name: derive from finance_period.project when fund_kind=project
    project_name = serializers.SerializerMethodField()
    period_period = serializers.CharField(source='period.period', read_only=True, allow_null=True)
    prorab_plan_id = serializers.IntegerField(source='prorab_plan.id', read_only=True, allow_null=True)
    prorab_plan_item_id = serializers.IntegerField(source='prorab_plan_item.id', read_only=True, allow_null=True)
    category_id = serializers.IntegerField(source='category.id', read_only=True, allow_null=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = ActualExpense
        fields = [
            'id', 'finance_period', 'finance_period_fund_kind', 'finance_period_month',
            'project_name', 'period', 'period_period',
            'prorab_plan', 'prorab_plan_id', 'prorab_plan_item', 'prorab_plan_item_id',
            'category', 'category_id', 'category_name',
            'name', 'amount', 'spent_at', 'comment', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def get_project_name(self, obj):
        """Get project name from finance_period when fund_kind=project."""
        if obj.finance_period and obj.finance_period.fund_kind == 'project' and obj.finance_period.project:
            return obj.finance_period.project.name
        return None
    
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


class ExpenseSerializer(serializers.ModelSerializer):
    """Serializer for Expense."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    plan_period_period = serializers.CharField(source='plan_period.period', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    plan_item_title = serializers.CharField(source='plan_item.title', read_only=True)
    plan_item_amount = serializers.DecimalField(source='plan_item.amount', read_only=True, max_digits=12, decimal_places=2)
    
    class Meta:
        model = Expense
        fields = [
            'id', 'plan_period', 'plan_period_period', 'plan_item', 'plan_item_title', 'plan_item_amount',
            'spent_at', 'category', 'category_name',
            'amount', 'comment', 'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def validate(self, attrs):
        """Validate category scope matches plan period fund_kind and plan_item belongs to plan_period."""
        # Get plan_period (from attrs for create, from instance for update)
        plan_period = attrs.get('plan_period')
        if not plan_period and self.instance:
            plan_period = self.instance.plan_period
        
        # Get plan_item (from attrs for create/update, from instance for update)
        plan_item = attrs.get('plan_item')
        if plan_item is None and self.instance:
            plan_item = self.instance.plan_item
        
        # Validate plan_item belongs to plan_period
        if plan_item and plan_period:
            # plan_item might be an ID (int) or a model instance
            from ..models import PlanItem
            try:
                if hasattr(plan_item, 'plan_period_id'):
                    # It's already a model instance
                    plan_item_obj = plan_item
                else:
                    # It's an ID, fetch the instance
                    plan_item_obj = PlanItem.objects.get(id=plan_item)
                
                if plan_item_obj.plan_period_id != plan_period.id:
                    raise serializers.ValidationError({
                        'plan_item': f'Plan item (plan_period_id={plan_item_obj.plan_period_id}) does not match plan_period (id={plan_period.id})'
                    })
            except PlanItem.DoesNotExist:
                raise serializers.ValidationError({
                    'plan_item': 'Selected plan item does not exist.'
                })
        
        # Get category (from attrs for create/update, from instance for update)
        category = attrs.get('category')
        if category is None and self.instance:
            category = self.instance.category
        
        # Only validate if category is provided
        if category and plan_period:
            # Use plan_period.fund_kind directly (no need to derive from project name)
            plan_fund_kind = plan_period.fund_kind
            
            # Map fund_kind to category scope (they should match)
            expected_scope = plan_fund_kind  # fund_kind values match scope values
            
            # Fetch category to check its scope
            # category might be an ID (int) or a model instance
            from apps.budgeting.models import ExpenseCategory
            try:
                if hasattr(category, 'id'):
                    # It's already a model instance
                    category_obj = category
                else:
                    # It's an ID, fetch the instance
                    category_obj = ExpenseCategory.objects.get(id=category)
                
                if category_obj.scope != expected_scope:
                    raise serializers.ValidationError({
                        'category': f"Category scope '{category_obj.scope}' does not match plan period fund_kind '{plan_fund_kind}'. Expected scope: '{expected_scope}'."
                    })
            except ExpenseCategory.DoesNotExist:
                raise serializers.ValidationError({
                    'category': 'Selected category does not exist.'
                })
        
        return attrs
    
    def validate_amount(self, value):
        """Validate amount field."""
        if value <= 0:
            raise serializers.ValidationError("Amount must be a positive number.")
        return value

