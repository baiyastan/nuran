"""
Budgeting API serializers.
"""
import re
from rest_framework import serializers
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.finance.services import assert_month_open_for_plans
from ..models import BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod, BudgetLine, BudgetExpense


class MonthPeriodField(serializers.Field):
    """Accepts period as pk (int) or month string (YYYY-MM). Returns MonthPeriod instance."""

    def to_internal_value(self, value):
        if value is None:
            raise serializers.ValidationError(MONTH_REQUIRED_MSG)
        if isinstance(value, int):
            try:
                return MonthPeriod.objects.get(pk=value)
            except (MonthPeriod.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError(MONTH_REQUIRED_MSG)
        if isinstance(value, str):
            month_str = value.strip()
            if not re.match(r'^\d{4}-\d{2}$', month_str):
                raise serializers.ValidationError("Month must be YYYY-MM (e.g. 2024-01).")
            try:
                return MonthPeriod.objects.get(month=month_str)
            except MonthPeriod.DoesNotExist:
                raise serializers.ValidationError(MONTH_REQUIRED_MSG)
        raise serializers.ValidationError(MONTH_REQUIRED_MSG)

    def to_representation(self, value):
        return value.pk if value else None


class MonthPeriodSerializer(serializers.ModelSerializer):
    """Serializer for MonthPeriod."""
    
    class Meta:
        model = MonthPeriod
        fields = [
            'id', 'month', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']
    
    def validate_month(self, value):
        """Validate month format: YYYY-MM. Normalize YYYY-MM-DD to YYYY-MM."""
        import re
        if not value:
            raise serializers.ValidationError("Month is required.")
        value = (value or '').strip()
        if re.match(r'^\d{4}-\d{2}-\d{2}$', value):
            value = value[:7]
        if not re.match(r'^\d{4}-\d{2}$', value):
            raise serializers.ValidationError("Month must be in format YYYY-MM (e.g., 2024-01)")
        return value

    def validate_status(self, value):
        """Validate status: must be OPEN or LOCKED (accepts lowercase and normalizes)."""
        if value is None or value == '':
            raise serializers.ValidationError("Status must be 'OPEN' or 'LOCKED'")
        normalized = (value or '').strip().upper()
        if normalized == 'OPEN':
            return 'OPEN'
        if normalized == 'LOCKED':
            return 'LOCKED'
        raise serializers.ValidationError("Status must be 'OPEN' or 'LOCKED'")


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
            'is_system_root', 'children_count', 'created_at', 'updated_at'
        ]
        read_only_fields = ['is_system_root', 'created_at', 'updated_at']
    
    def get_children_count(self, obj):
        """Get count of children categories."""
        return obj.children.filter(is_active=True).count()
    
    def validate_name(self, value):
        """Validate name field."""
        if not self.normalize_category_name_for_compare(value):
            raise serializers.ValidationError("Name is required.")
        return value

    def normalize_category_name_for_compare(self, name):
        """
        Normalize name for duplicate comparison:
        - trim
        - collapse multiple internal spaces to one
        - lowercase
        """
        normalized = re.sub(r'\s+', ' ', (name or '')).strip()
        if not normalized:
            return ''
        return normalized.lower()

    def normalize_category_name_for_store(self, name):
        """
        Normalize name for storage/display:
        - trim
        - collapse multiple internal spaces to one
        - uppercase first character only (keep the rest as user-entered)
        """
        normalized = re.sub(r'\s+', ' ', (name or '')).strip()
        if not normalized:
            return ''
        return normalized[:1].upper() + normalized[1:]
    
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
        parent = data.get('parent', getattr(self.instance, 'parent', None))
        scope = data.get('scope', getattr(self.instance, 'scope', None))
        kind = data.get('kind', getattr(self.instance, 'kind', None))
        raw_name = data.get('name', getattr(self.instance, 'name', ''))
        name_for_store = self.normalize_category_name_for_store(raw_name)
        normalized_name_for_compare = self.normalize_category_name_for_compare(raw_name)

        if not normalized_name_for_compare:
            raise serializers.ValidationError({'name': 'Name is required.'})
        data['name'] = name_for_store

        allow_root_creation = bool(self.context.get('allow_root_creation', False))
        if parent is None and not allow_root_creation:
            raise serializers.ValidationError({
                'parent': 'Root categories are system-defined and cannot be created manually.'
            })
        
        # If parent is provided, scope and kind must match parent
        if parent is not None:
            errors = {}
            
            # Handle both parent object (from instance) and parent ID (from request)
            if isinstance(parent, int):
                # Parent is an ID, fetch the parent object
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

        # Duplicate sibling guard (trim + collapsed spaces + case-insensitive)
        siblings = ExpenseCategory.objects.filter(
            scope=data.get('scope', getattr(self.instance, 'scope', None)),
            parent=parent,
        )
        if self.instance:
            siblings = siblings.exclude(pk=self.instance.pk)
        sibling_names = siblings.values_list('name', flat=True)
        if any(
            self.normalize_category_name_for_compare(existing_name) == normalized_name_for_compare
            for existing_name in sibling_names
        ):
            raise serializers.ValidationError({
                'name': 'Категория с таким названием уже существует у выбранного родителя.'
            })
        
        return data


class BudgetPlanSerializer(serializers.ModelSerializer):
    """Serializer for BudgetPlan (keyed by period + scope only)."""

    period = MonthPeriodField()
    period_month = serializers.CharField(source='period.month', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)

    class Meta:
        model = BudgetPlan
        fields = [
            'id', 'period', 'period_month', 'scope', 'project', 'project_name', 'status',
            'submitted_at', 'approved_by', 'approved_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['status', 'submitted_at', 'approved_by', 'approved_at', 'created_at', 'updated_at']

    def validate_scope(self, value):
        if value not in ('OFFICE', 'PROJECT', 'CHARITY'):
            raise serializers.ValidationError("Scope must be OFFICE, PROJECT, or CHARITY.")
        return value

    def validate(self, data):
        scope = data.get('scope')
        project = data.get('project')
        if scope in ('OFFICE', 'CHARITY') and project is not None:
            raise serializers.ValidationError({
                'project': f'Project must be NULL when scope is {scope}'
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

            # Enforce MonthPeriod OPEN for all plan-side line writes
            assert_month_open_for_plans(plan.period)
            
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
            
            if errors:
                raise serializers.ValidationError(errors)
        
        return data


class BulkUpsertBudgetLineItemSerializer(serializers.Serializer):
    """Nested serializer for a single budget line item in bulk upsert."""

    category = serializers.PrimaryKeyRelatedField(queryset=ExpenseCategory.objects.all())
    amount_planned = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
        min_value=0,
    )
    note = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_category(self, value):
        """Validate category is a leaf category and active."""
        if not value.is_leaf():
            raise serializers.ValidationError("Category must be a leaf category (no children).")
        if not value.is_active:
            raise serializers.ValidationError("Category must be active.")
        return value


class BulkUpsertBudgetLinesSerializer(serializers.Serializer):
    """Serializer for bulk upsert of budget lines."""

    plan = serializers.PrimaryKeyRelatedField(
        queryset=BudgetPlan.objects.all()
    )
    items = serializers.ListField(child=BulkUpsertBudgetLineItemSerializer())

    def validate(self, data):
        plan = data['plan']

        # Enforce MonthPeriod OPEN for all bulk upserts (no admin bypass)
        assert_month_open_for_plans(plan.period)

        scope_mapping = {
            'office': 'OFFICE',
            'project': 'PROJECT',
            'charity': 'CHARITY',
        }

        for idx, item in enumerate(data['items']):
            category = item['category']
            errors = {}
            expected_scope = scope_mapping.get(category.scope)
            if expected_scope and plan.scope != expected_scope:
                errors['category'] = f'Category scope "{category.scope}" does not match plan scope "{plan.scope}".'
            if errors:
                raise serializers.ValidationError({'items': {idx: errors}})

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

        # Enforce MonthPeriod OPEN for plan-side budget expenses
        assert_month_open_for_plans(plan.period)

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

