"""
Budgeting API serializers.
"""
from rest_framework import serializers
from ..models import BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod, BudgetLine, BudgetExpense


class MonthPeriodSerializer(serializers.ModelSerializer):
    """Serializer for MonthPeriod."""
    
    class Meta:
        model = MonthPeriod
        fields = [
            'id', 'month', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class BudgetPlanSummaryCommentSerializer(serializers.ModelSerializer):
    """Serializer for BudgetPlanSummaryComment."""
    
    updated_by_username = serializers.CharField(source='updated_by.username', read_only=True, allow_null=True)
    
    class Meta:
        model = BudgetPlanSummaryComment
        fields = [
            'id', 'plan', 'comment_text', 'updated_by', 'updated_by_username',
            'updated_at', 'created_at'
        ]
        read_only_fields = ['updated_by', 'updated_at', 'created_at']


class BudgetPlanSummaryCommentUpdateSerializer(serializers.Serializer):
    """Serializer for updating summary comment."""
    
    comment_text = serializers.CharField(required=True, allow_blank=False)
    
    def validate_comment_text(self, value):
        """Validate comment text is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Comment text is required and cannot be empty.")
        return value.strip()


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Serializer for ExpenseCategory."""
    
    parent_id = serializers.IntegerField(source='parent.id', read_only=True, allow_null=True)
    children_count = serializers.SerializerMethodField()
    
    class Meta:
        model = ExpenseCategory
        fields = [
            'id', 'name', 'scope', 'kind', 'parent', 'parent_id', 'is_active',
            'children_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def get_children_count(self, obj):
        """Get count of children categories."""
        return obj.children.filter(is_active=True).count()
    
    def validate_name(self, value):
        """Validate name field."""
        if not value or not value.strip():
            raise serializers.ValidationError("Name is required.")
        return value.strip()
    
    def validate_scope(self, value):
        """Validate scope field."""
        if value not in ['project', 'office', 'charity']:
            raise serializers.ValidationError("Scope must be 'project', 'office', or 'charity'.")
        return value
    
    def validate_kind(self, value):
        """Validate kind field."""
        if value not in ['EXPENSE', 'INCOME']:
            raise serializers.ValidationError("Kind must be 'EXPENSE' or 'INCOME'.")
        return value
    
    def validate(self, data):
        """Validate scope and kind match parent scope and kind."""
        parent = data.get('parent')
        scope = data.get('scope')
        kind = data.get('kind')
        
        # If parent is provided, scope and kind must match parent
        if parent is not None:
            errors = {}
            
            # Handle both parent object (from instance) and parent ID (from request)
            if isinstance(parent, int):
                # Parent is an ID, fetch the parent object
                from ..models import ExpenseCategory
                try:
                    parent_obj = ExpenseCategory.objects.get(pk=parent)
                except ExpenseCategory.DoesNotExist:
                    raise serializers.ValidationError({
                        'parent': f'Parent category with id={parent} does not exist.'
                    })
                parent = parent_obj
            
            if scope and scope != parent.scope:
                errors['scope'] = f'Scope must match parent scope. Parent "{parent.name}" has scope="{parent.scope}", but provided scope="{scope}".'
            
            if kind and kind != parent.kind:
                errors['kind'] = f'Kind must match parent kind. Parent "{parent.name}" has kind="{parent.kind}", but provided kind="{kind}".'
            
            if errors:
                raise serializers.ValidationError(errors)
            
            # Auto-set scope and kind from parent if not provided
            if not scope:
                data['scope'] = parent.scope
            if not kind:
                data['kind'] = parent.kind
        
        return data


class BudgetPlanSerializer(serializers.ModelSerializer):
    """Serializer for BudgetPlan."""
    
    period_month = serializers.CharField(source='period.month', read_only=True)
    root_category_name = serializers.CharField(source='root_category.name', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    
    class Meta:
        model = BudgetPlan
        fields = [
            'id', 'period', 'period_month', 'root_category', 'root_category_name',
            'scope', 'project', 'project_name', 'status',
            'submitted_at', 'approved_by', 'approved_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'submitted_at', 'approved_by', 'approved_at', 'created_at', 'updated_at']
    
    def validate_root_category(self, value):
        """Validate root_category is a root category (parent=None)."""
        if not value:
            raise serializers.ValidationError("Root category is required.")
        
        if not value.is_active:
            raise serializers.ValidationError("Root category must be active.")
        
        if value.parent is not None:
            raise serializers.ValidationError("Root category must have parent=None (must be a root category).")
        
        return value
    
    def validate(self, data):
        """Validate scope, root_category, and project consistency."""
        root_category = data.get('root_category')
        scope = data.get('scope')
        project = data.get('project')
        
        # Map root_category.scope to BudgetPlan.scope
        scope_mapping = {
            'office': 'OFFICE',
            'project': 'PROJECT',
            'charity': 'CHARITY'
        }
        
        if root_category:
            expected_scope = scope_mapping.get(root_category.scope)
            
            # Validate scope matches root_category.scope
            if scope and expected_scope and scope != expected_scope:
                raise serializers.ValidationError({
                    'scope': f'Scope must be {expected_scope} to match root_category.scope={root_category.scope}'
                })
            
            # Auto-set scope from root_category if not provided
            if not scope:
                data['scope'] = expected_scope
            
            # Validate project based on root_category.scope
            if root_category.scope in ('office', 'charity') and project is not None:
                raise serializers.ValidationError({
                    'project': f'Project must be NULL when root_category.scope is "{root_category.scope}"'
                })
            elif root_category.scope == 'project' and project is None:
                raise serializers.ValidationError({
                    'project': 'Project is required when root_category.scope is "project"'
                })
        
        return data


class BudgetLineSerializer(serializers.ModelSerializer):
    """Serializer for BudgetLine."""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    plan_status = serializers.CharField(source='plan.status', read_only=True)
    
    class Meta:
        model = BudgetLine
        fields = [
            'id', 'plan', 'category', 'category_name', 'amount_planned', 'note',
            'plan_status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate_category(self, value):
        """Validate category is a leaf category."""
        if not value.is_leaf():
            raise serializers.ValidationError("Category must be a leaf category (no children).")
        if not value.is_active:
            raise serializers.ValidationError("Category must be active.")
        return value
    
    def validate(self, data):
        """Validate plan status, category scope/kind consistency, and category is leaf."""
        plan = data.get('plan')
        category = data.get('category')
        
        # For update operations, get plan from instance if not in data
        if not plan and self.instance:
            plan = self.instance.plan
        
        if plan:
            errors = {}
            
            # Enforce OPEN status for create/update (strict - no admin override for now)
            if plan.status != 'OPEN':
                errors['plan'] = f'Cannot add or modify budget lines. Plan status must be OPEN. Current status: {plan.status}'
            
            if category:
                # Validate category is a leaf (already checked in validate_category, but double-check)
                if not category.is_leaf():
                    errors['category'] = 'Category must be a leaf category (no children).'
                
                # Validate category scope matches plan scope
                scope_mapping = {
                    'office': 'OFFICE',
                    'project': 'PROJECT',
                    'charity': 'CHARITY'
                }
                expected_scope = scope_mapping.get(category.scope)
                
                if expected_scope and plan.scope != expected_scope:
                    error_msg = f'Category scope "{category.scope}" does not match plan scope "{plan.scope}".'
                    if 'category' in errors:
                        errors['category'] += ' ' + error_msg
                    else:
                        errors['category'] = error_msg
                
                # Validate category kind matches plan's root_category kind
                if plan.root_category and category.kind != plan.root_category.kind:
                    error_msg = f'Category kind "{category.kind}" does not match plan root category kind "{plan.root_category.kind}".'
                    if 'category' in errors:
                        errors['category'] += ' ' + error_msg
                    else:
                        errors['category'] = error_msg
            
            if errors:
                raise serializers.ValidationError(errors)
        
        return data


class BudgetExpenseSerializer(serializers.ModelSerializer):
    """Serializer for BudgetExpense."""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, allow_null=True)
    
    class Meta:
        model = BudgetExpense
        fields = [
            'id', 'plan', 'category', 'category_name', 'amount_spent', 'comment',
            'spent_at', 'created_by', 'created_by_username', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']
    
    def validate_category(self, value):
        """Validate category is leaf, active, and kind is EXPENSE."""
        if not value.is_leaf():
            raise serializers.ValidationError("Category must be a leaf category (no children).")
        if not value.is_active:
            raise serializers.ValidationError("Category must be active.")
        if value.kind != 'EXPENSE':
            raise serializers.ValidationError(f"Category kind must be EXPENSE. Current kind: {value.kind}")
        return value
    
    def validate(self, data):
        """Validate plan status and category scope matches plan scope."""
        plan = data.get('plan')
        category = data.get('category')
        
        # For update operations, get plan from instance if not in data
        if not plan and self.instance:
            plan = self.instance.plan
        
        if not plan:
            raise serializers.ValidationError({'plan': 'Plan is required.'})
        
        errors = {}
        
        # Validate plan status is APPROVED for write operations
        if plan.status != 'APPROVED':
            errors['plan'] = f'Cannot create or modify expenses. Plan status must be APPROVED. Current status: {plan.status}'
        
        if category:
            # Validate category scope matches plan scope
            scope_mapping = {
                'office': 'OFFICE',
                'project': 'PROJECT',
                'charity': 'CHARITY'
            }
            expected_scope = scope_mapping.get(category.scope)
            
            if expected_scope and plan.scope != expected_scope:
                error_msg = f'Category scope "{category.scope}" does not match plan scope "{plan.scope}".'
                if 'category' in errors:
                    errors['category'] += ' ' + error_msg
                else:
                    errors['category'] = error_msg
        
        if errors:
            raise serializers.ValidationError(errors)
        
        return data

