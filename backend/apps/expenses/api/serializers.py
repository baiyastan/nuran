"""
Expenses API serializers.
"""
import re
from rest_framework import serializers
from apps.expenses.models import ActualExpense
from apps.budgeting.models import ExpenseCategory, MonthPeriod
from apps.finance.services import assert_month_exists_for_facts


class ActualExpenseSerializer(serializers.ModelSerializer):
    """Serializer for ActualExpense. Keyed by month_period + scope. Validates month_period.status == OPEN on write."""

    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    month_period_month = serializers.CharField(source='month_period.month', read_only=True)
    month = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = ActualExpense
        fields = [
            'id', 'month_period', 'month_period_month', 'scope', 'month',
            'category', 'category_name',
            'amount', 'spent_at', 'comment',
            'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'month_period_month']
        extra_kwargs = {'month_period': {'required': False}}

    def validate_month(self, value):
        if not value or not value.strip():
            return value
        value = value.strip()
        if not re.match(r'^\d{4}-\d{2}$', value):
            raise serializers.ValidationError('Month must be YYYY-MM (e.g. 2024-01).')
        return value

    def validate_scope(self, value):
        if value not in ('OFFICE', 'PROJECT', 'CHARITY'):
            raise serializers.ValidationError('Scope must be OFFICE, PROJECT, or CHARITY.')
        return value

    def validate_month_period(self, value):
        """Ensure month period exists (OPEN or LOCKED allowed for facts)."""
        if not value:
            return value
        # Enforce existence only; status may be OPEN or LOCKED
        assert_month_exists_for_facts(value)
        return value

    def validate_comment(self, value):
        if not value or not str(value).strip():
            raise serializers.ValidationError('Comment is required and cannot be empty.')
        return value.strip()

    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate_category(self, value):
        if value is None:
            return value
        scope = self.initial_data.get('scope') if self.initial_data else None
        if not scope and self.instance:
            scope = self.instance.scope
        if scope:
            scope_lower = {'OFFICE': 'office', 'PROJECT': 'project', 'CHARITY': 'charity'}.get(scope)
            if scope_lower and value.scope != scope_lower:
                raise serializers.ValidationError(
                    f'Category scope "{value.scope}" does not match expense scope "{scope}".'
                )
        from apps.expenses.base import validate_expense_category
        try:
            validate_expense_category(value, plan_scope=None)
        except Exception as e:
            raise serializers.ValidationError(str(e))
        return value

    def validate(self, attrs):
        # Create: require month + scope if month_period not provided
        if not self.instance:
            month = attrs.get('month') or (self.initial_data.get('month') if self.initial_data else None)
            scope = attrs.get('scope')
            month_period = attrs.get('month_period')
            if not month_period and month and scope:
                # Resolve existing MonthPeriod without auto-creating new ones
                month_str = month.strip()
                try:
                    mp = MonthPeriod.objects.get(month=month_str)
                except MonthPeriod.DoesNotExist:
                    raise serializers.ValidationError(
                        {'month': 'Month period does not exist. Please open the month first.'}
                    )
                # Enforce existence only; status may be OPEN or LOCKED
                assert_month_exists_for_facts(mp)
                attrs['month_period'] = mp
                attrs.pop('month', None)
            elif not month_period:
                if not scope:
                    raise serializers.ValidationError('scope is required.')
                raise serializers.ValidationError('Either month_period or month (YYYY-MM) is required, and the month must be opened first.')
        else:
            attrs.pop('month', None)
        return attrs

    def create(self, validated_data):
        validated_data.pop('month', None)
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
