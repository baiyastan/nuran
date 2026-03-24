"""
Reports API serializers.
"""
from rest_framework import serializers
from decimal import Decimal


class CategorySummarySerializer(serializers.Serializer):
    """Serializer for category summary in budget report."""
    
    category_id = serializers.IntegerField()
    category_name = serializers.CharField()
    planned = serializers.DecimalField(max_digits=12, decimal_places=2)
    actual = serializers.DecimalField(max_digits=12, decimal_places=2)
    delta = serializers.DecimalField(max_digits=12, decimal_places=2)


class ExpenseItemSerializer(serializers.Serializer):
    """Serializer for expense item in budget report."""
    
    id = serializers.IntegerField()
    date = serializers.DateField()
    category_name = serializers.CharField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    comment = serializers.CharField()
    created_by = serializers.CharField()


class BudgetPlanReportSerializer(serializers.Serializer):
    """Serializer for budget plan report."""
    
    planned_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    actual_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    delta = serializers.DecimalField(max_digits=12, decimal_places=2)
    over_budget = serializers.BooleanField()
    per_category = CategorySummarySerializer(many=True)
    expenses = ExpenseItemSerializer(many=True)
    summary_comment = serializers.CharField(allow_null=True)


class ForemanProjectSummaryItemSerializer(serializers.Serializer):
    """Serializer for per-project foreman summary row."""

    project_id = serializers.IntegerField()
    project_name = serializers.CharField()
    planned_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    actual_total = serializers.DecimalField(max_digits=12, decimal_places=2)
    difference = serializers.DecimalField(max_digits=12, decimal_places=2)


class ForemanProjectSummaryDataSerializer(serializers.Serializer):
    """Serializer for foreman project summary payload."""

    month = serializers.CharField()
    projects = ForemanProjectSummaryItemSerializer(many=True)

