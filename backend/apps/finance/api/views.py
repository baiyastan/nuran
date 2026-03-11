"""
Finance API views.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum, Count, DecimalField, Value, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.response import Response

from apps.budgeting.models import MonthPeriod
from apps.expenses.services import get_balance_for_account
from apps.finance.constants import MONTH_REQUIRED_MSG
from ..models import FinancePeriod, IncomeEntry, IncomeSource, IncomePlan, Transfer, ACCOUNT_CHOICES, AccountLedgerLock
from ..services import (
    FinancePeriodService,
    IncomeEntryService,
    IncomePlanService,
    IncomeSummaryService,
    assert_month_open,
    assert_month_exists_for_facts,
)
from ..serializers import FinancePeriodSerializer, IncomeEntrySerializer, IncomeSourceSerializer, IncomePlanSerializer, IncomeSummarySerializer, TransferSerializer
from ..permissions import FinancePeriodPermission, IncomeEntryPermission, IncomeSourcePermission, IncomePlanPermission, TransferPermission
from ..filters import IncomeEntryFilter


class FinancePeriodViewSet(viewsets.ModelViewSet):
    """ViewSet for FinancePeriod."""
    
    queryset = FinancePeriod.objects.all()
    serializer_class = FinancePeriodSerializer
    permission_classes = [FinancePeriodPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['month_period', 'fund_kind', 'project', 'status']
    search_fields = []
    ordering_fields = ['created_at', 'month_period__month']
    ordering = ['-month_period__month', '-created_at']
    
    def get_queryset(self):
        """Filter queryset based on user role and annotate totals."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'month_period',
            'project',
            'created_by'
        )
        
        # Annotate totals using Subquery to avoid cartesian join inflation
        # Calculate income_total from IncomeEntry
        income_subquery = Subquery(
            IncomeEntry.objects
            .filter(finance_period=OuterRef('pk'))
            .values('finance_period')
            .annotate(total=Sum('amount'))
            .values('total')[:1],
            output_field=DecimalField(max_digits=12, decimal_places=2)
        )
        
        queryset = queryset.annotate(
            income_total=Coalesce(
                income_subquery,
                Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
            )
        )
        
        # Filter by year/month if provided (integers) or month (YYYY-MM string)
        year = self.request.query_params.get('year')
        month = self.request.query_params.get('month')

        if year and month:
            # Both year and month provided as integers
            try:
                year_int = int(year)
                month_int = int(month)
                if 1 <= month_int <= 12:
                    month_str = f"{year_int:04d}-{month_int:02d}"
                    queryset = queryset.filter(month_period__month=month_str)
            except (ValueError, TypeError):
                # Invalid year/month format - skip filtering
                pass
        elif month:
            # Only month provided (assume YYYY-MM format for backward compatibility)
            queryset = queryset.filter(month_period__month=month)
        
        # Admin: see all finance periods
        if self.request.user.role == 'admin':
            return queryset
        
        # Director: see all finance periods (read-only)
        if self.request.user.role == 'director':
            return queryset
        
        # Foreman: can only see project fund_kind for assigned projects
        if self.request.user.role == 'foreman':
            queryset = queryset.filter(
                fund_kind='project',
                project__assignments__prorab=self.request.user
            ).distinct()
            return queryset
        
        # Others: no access (permission class handles this)
        return queryset.none()
    
    def perform_create(self, serializer):
        """Create finance period with audit logging."""
        # Fail-fast: check month period is open
        month_period = serializer.validated_data.get('month_period')
        assert_month_open(month_period)
        
        # Call service
        finance_period = FinancePeriodService.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = finance_period
    
    def perform_update(self, serializer):
        """Update finance period with audit logging."""
        # Fail-fast: check month period is open (from validated_data or instance)
        month_period = serializer.validated_data.get('month_period', serializer.instance.month_period)
        assert_month_open(month_period)
        
        # Call service
        FinancePeriodService.update(
            finance_period=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete finance period with audit logging."""
        # Fail-fast: check month period is open
        assert_month_open(instance.month_period)
        
        # Call service
        FinancePeriodService.delete(finance_period=instance, user=self.request.user)
    
    @action(detail=True, methods=["get"], url_path="income-summary")
    def income_summary(self, request, pk=None):
        """Get income summary breakdown by source for this finance period."""
        finance_period = self.get_object()
        summary_data = IncomeSummaryService.build_for_finance_period(finance_period)
        # Return dict directly (serializers defined for structure/documentation)
        return Response(summary_data)


class IncomeEntryViewSet(viewsets.ModelViewSet):
    """ViewSet for IncomeEntry."""
    
    queryset = IncomeEntry.objects.all()
    serializer_class = IncomeEntrySerializer
    permission_classes = [IncomeEntryPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['finance_period']
    filterset_class = IncomeEntryFilter
    search_fields = ['comment']
    ordering_fields = ['received_at', 'created_at', 'amount']
    ordering = ['-received_at', '-created_at']
    
    def get_queryset(self):
        """Return all income entries with optimized queries.
        
        Permission checks are handled by permission classes and service layer.
        This allows object lookup to succeed, enabling proper 403 responses
        instead of 404 when business rules (e.g., locked months) are violated.
        """
        return (
            IncomeEntry.objects
            .select_related(
                'finance_period',
                'finance_period__month_period',
                'source',
                'created_by'
            )
        )

    def list(self, request, *args, **kwargs):
        """
        List income entries.

        For dashboard drill-down, when both month and source are provided, this
        endpoint aggregates across all finance periods for the given month_period
        and source (including source='null') and returns paginated results with
        total_count and total_amount metadata.
        """
        month = request.query_params.get('month')
        source_param = request.query_params.get('source')

        # Fallback to default behavior when not using month+source drill-down.
        if not (month and source_param is not None):
            return super().list(request, *args, **kwargs)

        month = month.strip()
        try:
            month_period = MonthPeriod.objects.get(month=month)
        except MonthPeriod.DoesNotExist:
            return Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

        queryset = self.get_queryset().filter(
            finance_period__month_period=month_period,
        )

        if source_param == 'null':
            queryset = queryset.filter(source__isnull=True)
        else:
            try:
                source_id = int(source_param)
            except (TypeError, ValueError):
                queryset = queryset.none()
            else:
                queryset = queryset.filter(source_id=source_id)

        # Apply additional filters (fund_kind, project, search, ordering, etc.)
        queryset = self.filter_queryset(queryset)

        total_count = queryset.count()
        total_amount = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            data = response.data
            data['total_count'] = total_count
            data['total_amount'] = str(total_amount.quantize(Decimal('0.00')))
            data['payer_breakdown'] = []
            response.data = data
            return response

        serializer = self.get_serializer(queryset, many=True)
        data = {
            'count': total_count,
            'next': None,
            'previous': None,
            'results': serializer.data,
            'total_count': total_count,
            'total_amount': str(total_amount.quantize(Decimal('0.00'))),
            'payer_breakdown': [],
        }
        return Response(data)

    def perform_create(self, serializer):
        """Create income entry with audit logging."""
        # Fail-fast: require related MonthPeriod to exist (OPEN or LOCKED allowed)
        # Serializer validates finance_period is required, so direct access is safe
        finance_period = serializer.validated_data['finance_period']
        if not finance_period:
            raise ValidationError({'finance_period': 'Finance period is required'})
        
        assert_month_exists_for_facts(finance_period.month_period)
        
        # Call service
        income_entry = IncomeEntryService.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = income_entry
    
    def perform_update(self, serializer):
        """Update income entry with audit logging."""
        # Fail-fast: require related MonthPeriod to exist (from validated_data or instance)
        finance_period = serializer.validated_data.get('finance_period', serializer.instance.finance_period)
        assert_month_exists_for_facts(finance_period.month_period)
        
        # Call service
        IncomeEntryService.update(
            income_entry=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete income entry with audit logging."""
        # Fail-fast: require related MonthPeriod to exist
        assert_month_exists_for_facts(instance.finance_period.month_period)
        
        # Call service
        IncomeEntryService.delete(income_entry=instance, user=self.request.user)


class IncomeSourceViewSet(viewsets.ModelViewSet):
    """ViewSet for IncomeSource."""
    
    queryset = IncomeSource.objects.all()
    serializer_class = IncomeSourceSerializer
    permission_classes = [IncomeSourcePermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name']
    ordering_fields = ['name', 'created_at']
    ordering = ['name']
    
    def get_queryset(self):
        """Filter queryset - default to active sources only."""
        queryset = super().get_queryset()
        
        # Default filter: only active sources unless explicitly requested
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is None:
            queryset = queryset.filter(is_active=True)
        
        return queryset


class IncomePlanViewSet(viewsets.ModelViewSet):
    """ViewSet for IncomePlan."""
    
    queryset = IncomePlan.objects.all()
    serializer_class = IncomePlanSerializer
    permission_classes = [IncomePlanPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['period', 'source']
    search_fields = []
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter queryset with year/month support."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'period',
            'period__month_period',
            'source'
        )
        
        # Filter by year/month if provided
        year = self.request.query_params.get('year')
        month = self.request.query_params.get('month')
        
        if year and month:
            try:
                year_int = int(year)
                month_int = int(month)
                month_str = f"{year_int}-{month_int:02d}"
                queryset = queryset.filter(period__month_period__month=month_str)
            except (ValueError, TypeError):
                pass
        
        return queryset
    
    def perform_create(self, serializer):
        """Create income plan with period open check."""
        # Service will check period is open
        income_plan = IncomePlanService.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = income_plan
    
    def perform_update(self, serializer):
        """Update income plan with period open check."""
        # Service will check period is open
        IncomePlanService.update(
            income_plan=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete income plan with period open check."""
        # Service will check period is open
        IncomePlanService.delete(income_plan=instance, user=self.request.user)
    
    def list(self, request, *args, **kwargs):
        """List income plans with monthly summary data."""
        # Extract year/month from query params FIRST
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        
        # Resolve period IMMEDIATELY (independent of IncomePlan existence)
        period_info = None
        if year and month:
            try:
                year_int = int(year)
                month_int = int(month)
                
                # Resolve FinancePeriod using service method (don't raise error if not found)
                # Income plans belong to fund_kind='office'
                finance_period = IncomePlanService.resolve_finance_period(
                    year_int, month_int, fund_kind='office', raise_error=False
                )
                
                # Build period_info from resolved period (even if queryset is empty)
                period_info = IncomePlanService.serialize_finance_period(finance_period)
            except (ValueError, TypeError):
                # Invalid year/month format - period_info remains None
                pass
        
        # Only AFTER resolving period: filter queryset
        queryset = self.filter_queryset(self.get_queryset())
        
        # Calculate summary using aggregate
        summary = queryset.aggregate(
            total_amount=Coalesce(Sum('amount'), Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))),
            items_count=Count('id')
        )
        
        # Paginate queryset (if pagination is enabled)
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            paginated_response = self.get_paginated_response(serializer.data)
            
            # Build custom response with summary, preserving pagination structure
            response_data = paginated_response.data.copy()
            response_data['period'] = period_info
            response_data['summary'] = {
                'total_amount': str(summary['total_amount']),
                'items_count': summary['items_count']
            }
            
            return Response(response_data)
        
        # No pagination - return simple list
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'period': period_info,
            'summary': {
                'total_amount': str(summary['total_amount']),
                'items_count': summary['items_count']
            },
            'results': serializer.data
        })


class TransferViewSet(viewsets.ModelViewSet):
    """ViewSet for Transfer (internal cash↔bank). Not income, not expense."""

    queryset = Transfer.objects.all()
    serializer_class = TransferSerializer
    permission_classes = [TransferPermission]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['source_account', 'destination_account']
    ordering_fields = ['transferred_at', 'created_at', 'amount']
    ordering = ['-transferred_at', '-created_at']

    def get_queryset(self):
        qs = Transfer.objects.select_related('created_by')
        month = self.request.query_params.get('month')
        if month:
            try:
                year_int = int(month[:4])
                month_int = int(month[5:7])
                if 1 <= month_int <= 12:
                    from datetime import date
                    from calendar import monthrange
                    first = date(year_int, month_int, 1)
                    last_day = monthrange(year_int, month_int)[1]
                    last = date(year_int, month_int, last_day)
                    qs = qs.filter(transferred_at__gte=first, transferred_at__lte=last)
            except (ValueError, IndexError):
                pass
        return qs

    def perform_create(self, serializer):
        src = serializer.validated_data.get('source_account')
        amount = serializer.validated_data.get('amount')
        transferred_at = serializer.validated_data.get('transferred_at')

        if src in dict(ACCOUNT_CHOICES) and amount is not None and transferred_at is not None:
            with transaction.atomic():
                # Lock per-account row to serialize debits from this source account
                AccountLedgerLock.objects.select_for_update().get_or_create(account=src)
                # Re-check balance inside locked transaction
                balance = get_balance_for_account(
                    src,
                    transferred_at,
                    exclude_expense_id=None,
                    exclude_transfer_id=None,
                )
                if balance < amount:
                    label = dict(ACCOUNT_CHOICES).get(src, src)
                    raise ValidationError(
                        {'amount': f'Insufficient balance on {label}. Available: {balance:.2f}.'}
                    )
                serializer.save(created_by=self.request.user)
        else:
            serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.instance
        src = serializer.validated_data.get('source_account', getattr(instance, 'source_account', None))
        amount = serializer.validated_data.get('amount', getattr(instance, 'amount', None))
        transferred_at = serializer.validated_data.get('transferred_at', getattr(instance, 'transferred_at', None))

        if src in dict(ACCOUNT_CHOICES) and amount is not None and transferred_at is not None:
            with transaction.atomic():
                AccountLedgerLock.objects.select_for_update().get_or_create(account=src)
                balance = get_balance_for_account(
                    src,
                    transferred_at,
                    exclude_expense_id=None,
                    exclude_transfer_id=getattr(instance, 'pk', None),
                )
                if balance < amount:
                    label = dict(ACCOUNT_CHOICES).get(src, src)
                    raise ValidationError(
                        {'amount': f'Insufficient balance on {label}. Available: {balance:.2f}.'}
                    )
                serializer.save()
        else:
            serializer.save()

    def perform_destroy(self, instance):
        instance.delete()
