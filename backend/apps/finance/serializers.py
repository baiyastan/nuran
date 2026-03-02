"""
Finance API serializers.
"""
from rest_framework import serializers
from rest_framework.exceptions import ValidationError as DRFValidationError
from decimal import Decimal
from datetime import date
from django.shortcuts import get_object_or_404
from .models import FinancePeriod, IncomeEntry, IncomeSource, IncomePlan
from .services import IncomePlanService


class FinancePeriodSerializer(serializers.ModelSerializer):
    """Serializer for FinancePeriod."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    month_period_month = serializers.CharField(source='month_period.month', read_only=True)
    project_name = serializers.CharField(source='project.name', read_only=True, allow_null=True)
    fund_kind_display = serializers.CharField(source='get_fund_kind_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    
    # Computed totals (from queryset annotations)
    income_total = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = FinancePeriod
        fields = [
            'id', 'month_period', 'month_period_month',
            'fund_kind', 'fund_kind_display',
            'project', 'project_name',
            'income_total',
            'status', 'status_display',
            'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at', 'income_total']
    
    def validate(self, data):
        """Validate fund_kind and project relationship."""
        fund_kind = data.get('fund_kind', self.instance.fund_kind if self.instance else None)
        project = data.get('project', self.instance.project if self.instance else None)
        
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
        
        return data


class IncomeSourceSerializer(serializers.ModelSerializer):
    """Serializer for IncomeSource."""
    
    class Meta:
        model = IncomeSource
        fields = ['id', 'name', 'is_active']
        read_only_fields = ['id']


class IncomeEntrySerializer(serializers.ModelSerializer):
    """Serializer for IncomeEntry."""
    
    created_by_username = serializers.CharField(source='created_by.username', read_only=True)
    finance_period_fund_kind = serializers.CharField(source='finance_period.fund_kind', read_only=True)
    finance_period_month = serializers.CharField(source='finance_period.month_period.month', read_only=True)
    project_name = serializers.CharField(source='finance_period.project.name', read_only=True, allow_null=True)
    source = IncomeSourceSerializer(read_only=True)
    source_id = serializers.PrimaryKeyRelatedField(
        queryset=IncomeSource.objects.filter(is_active=True),
        write_only=True,
        source='source',
        required=False,
        allow_null=True,
        help_text='Income source ID'
    )
    
    class Meta:
        model = IncomeEntry
        fields = [
            'id', 'finance_period', 'finance_period_fund_kind', 'finance_period_month',
            'project_name', 'source', 'source_id', 'amount', 'received_at', 'comment',
            'created_by', 'created_by_username',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_by', 'source', 'created_at', 'updated_at']
    
    def validate_comment(self, value):
        """Validate comment field."""
        if not value or len(value.strip()) < 1:
            raise serializers.ValidationError("Comment is required and cannot be empty.")
        return value.strip()
    
    def validate_amount(self, value):
        """Validate amount field."""
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
    
    def validate(self, data):
        """Validate finance_period is provided."""
        finance_period = data.get('finance_period', self.instance.finance_period if self.instance else None)
        if not finance_period:
            raise serializers.ValidationError({
                'finance_period': 'Finance period is required'
            })
        return data


class IncomePlanSerializer(serializers.ModelSerializer):
    """Serializer for IncomePlan."""
    
    year = serializers.IntegerField(write_only=True, help_text='Year (e.g., 2024)')
    month = serializers.IntegerField(write_only=True, help_text='Month (1-12)')
    source = IncomeSourceSerializer(read_only=True)
    source_id = serializers.PrimaryKeyRelatedField(
        queryset=IncomeSource.objects.filter(is_active=True),
        write_only=True,
        source='source',
        help_text='Income source ID'
    )
    
    class Meta:
        model = IncomePlan
        fields = [
            'id', 'year', 'month', 'source', 'source_id', 'amount',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'source', 'created_at', 'updated_at']
    
    def validate_amount(self, value):
        """Validate amount field."""
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
    
    def validate_year(self, value):
        """Validate year field."""
        if value < 2000 or value > 2100:
            raise serializers.ValidationError("Year must be between 2000 and 2100.")
        return value
    
    def validate_month(self, value):
        """Validate month field."""
        if value < 1 or value > 12:
            raise serializers.ValidationError("Month must be between 1 and 12.")
        return value
    
    def validate(self, data):
        """Validate and resolve FinancePeriod by year/month."""
        year = data.get('year')
        month = data.get('month')
        
        if year and month:
            # Resolve FinancePeriod using service method
            # Income plans belong to fund_kind='office'
            try:
                finance_period = IncomePlanService.resolve_finance_period(
                    year, month, fund_kind='office', raise_error=True
                )
                data['period'] = finance_period
                # Remove year/month from data as they are not model fields
                data.pop('year', None)
                data.pop('month', None)
            except DRFValidationError as e:
                # Re-raise DRF ValidationError as serializers.ValidationError
                raise serializers.ValidationError(e.detail)
        
        return data
    
    def to_representation(self, instance):
        """Customize output representation."""
        representation = super().to_representation(instance)
        
        # Extract year and month from period.month_period.month
        if instance.period and instance.period.month_period:
            month_str = instance.period.month_period.month
            try:
                year, month = map(int, month_str.split('-'))
                representation['year'] = year
                representation['month'] = month
            except (ValueError, AttributeError):
                representation['year'] = None
                representation['month'] = None
        else:
            representation['year'] = None
            representation['month'] = None
        
        # Remove source_id from output
        representation.pop('source_id', None)
        
        return representation


class IncomeSummaryRowSerializer(serializers.Serializer):
    """Serializer for income summary row."""
    
    source_id = serializers.IntegerField()
    source_name = serializers.CharField()
    planned = serializers.CharField()
    actual = serializers.CharField()
    diff = serializers.CharField()
    plans_count = serializers.IntegerField()
    entries_count = serializers.IntegerField()


class IncomeSummarySerializer(serializers.Serializer):
    """Serializer for income summary response."""
    
    rows = IncomeSummaryRowSerializer(many=True)
    planned_total = serializers.CharField()
    actual_total = serializers.CharField()
    diff_total = serializers.CharField()

