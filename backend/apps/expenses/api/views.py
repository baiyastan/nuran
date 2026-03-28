"""
Expenses API views.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter
from rest_framework.response import Response

from apps.audit.services import AuditLogService, optional_audit_reason
from apps.reports.invalidation import invalidate_for_expense_actual_write
from apps.expenses.models import ActualExpense
from apps.expenses.permissions import ActualExpensePermission
from apps.expenses.services import assert_sufficient_balance
from apps.finance.models import ACCOUNT_CHOICES, AccountLedgerLock
from .serializers import ActualExpenseSerializer


class ActualExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for ActualExpense - keyed by month + scope (OFFICE/PROJECT/CHARITY). No FinancePeriod."""

    serializer_class = ActualExpenseSerializer
    permission_classes = [ActualExpensePermission]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    # Scope is handled via filterset; category (including null) is handled explicitly in get_queryset.
    filterset_fields = ['scope', 'account']
    ordering_fields = ['spent_at', 'created_at', 'amount']
    ordering = ['-spent_at', '-created_at']

    def get_queryset(self):
        qs = ActualExpense.objects.all().select_related(
            'month_period',
            'category',
            'created_by',
        )

        month = self.request.query_params.get('month')
        if month:
            qs = qs.filter(month_period__month=month)

        # Category filtering, including uncategorized (category is null)
        category_param = self.request.query_params.get('category')
        if category_param is not None:
            if category_param == 'null':
                qs = qs.filter(category__isnull=True)
            else:
                try:
                    qs = qs.filter(category_id=int(category_param))
                except (TypeError, ValueError):
                    qs = qs.none()

        scope = self.request.query_params.get('scope')
        if scope and scope in ('OFFICE', 'PROJECT', 'CHARITY'):
            qs = qs.filter(scope=scope)

        spent_at_gte = self.request.query_params.get('spent_at__gte')
        if spent_at_gte:
            qs = qs.filter(spent_at__gte=spent_at_gte)
        spent_at_lte = self.request.query_params.get('spent_at__lte')
        if spent_at_lte:
            qs = qs.filter(spent_at__lte=spent_at_lte)

        return qs

    def list(self, request, *args, **kwargs):
        """
        List actual expenses with pagination plus aggregate totals for the
        full filtered queryset (used by GlobalSummary drill-down).
        """
        queryset = self.filter_queryset(self.get_queryset())

        total_count = queryset.count()
        total_amount = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            response = self.get_paginated_response(serializer.data)
            data = response.data
            data['total_count'] = total_count
            data['total_amount'] = str(total_amount.quantize(Decimal('0.00')))
            data['vendor_breakdown'] = []
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
            'vendor_breakdown': [],
        }
        return Response(data)

    def perform_create(self, serializer):
        account = serializer.validated_data.get('account')
        amount = serializer.validated_data.get('amount')
        spent_at = serializer.validated_data.get('spent_at')

        # If account is a known ledger account, serialize debits with a per-account lock
        if account in dict(ACCOUNT_CHOICES) and amount is not None and spent_at is not None:
            with transaction.atomic():
                # Acquire per-account lock row (creates row once, then locks it on each use)
                AccountLedgerLock.objects.select_for_update().get_or_create(account=account)
                # Re-check balance inside the locked transaction to close TOCTOU window
                try:
                    assert_sufficient_balance(account, amount, spent_at, exclude_expense_id=None)
                except ValueError as e:
                    raise DRFValidationError({'amount': [str(e)]})
                serializer.save()
                AuditLogService.log_create(
                    self.request.user,
                    serializer.instance,
                    reason=optional_audit_reason(self.request),
                )
                invalidate_for_expense_actual_write(
                    invalidate_monthly_pairs=[(serializer.instance.month_period, serializer.instance.scope)],
                )
        else:
            with transaction.atomic():
                serializer.save()
                AuditLogService.log_create(
                    self.request.user,
                    serializer.instance,
                    reason=optional_audit_reason(self.request),
                )
                invalidate_for_expense_actual_write(
                    invalidate_monthly_pairs=[(serializer.instance.month_period, serializer.instance.scope)],
                )

    def perform_update(self, serializer):
        # Resolve effective values after patch (fall back to instance for partial updates)
        instance = serializer.instance
        before_state = AuditLogService.model_field_snapshot(instance)
        old_mp = instance.month_period
        old_scope = instance.scope
        account = serializer.validated_data.get('account', getattr(instance, 'account', None))
        amount = serializer.validated_data.get('amount', getattr(instance, 'amount', None))
        spent_at = serializer.validated_data.get('spent_at', getattr(instance, 'spent_at', None))

        if account in dict(ACCOUNT_CHOICES) and amount is not None and spent_at is not None:
            with transaction.atomic():
                AccountLedgerLock.objects.select_for_update().get_or_create(account=account)
                try:
                    assert_sufficient_balance(
                        account,
                        amount,
                        spent_at,
                        exclude_expense_id=getattr(instance, 'pk', None),
                    )
                except ValueError as e:
                    raise DRFValidationError({'amount': [str(e)]})
                serializer.save()
                AuditLogService.log_update(
                    self.request.user,
                    serializer.instance,
                    before_state,
                    reason=optional_audit_reason(self.request),
                )
                inst = serializer.instance
                invalidate_for_expense_actual_write(
                    invalidate_monthly_pairs=[
                        (old_mp, old_scope),
                        (inst.month_period, inst.scope),
                    ],
                )
        else:
            with transaction.atomic():
                serializer.save()
                AuditLogService.log_update(
                    self.request.user,
                    serializer.instance,
                    before_state,
                    reason=optional_audit_reason(self.request),
                )
                inst = serializer.instance
                invalidate_for_expense_actual_write(
                    invalidate_monthly_pairs=[
                        (old_mp, old_scope),
                        (inst.month_period, inst.scope),
                    ],
                )

    def perform_destroy(self, instance):
        object_id = instance.pk
        before_state = AuditLogService.model_field_snapshot(instance)
        before_state['id'] = instance.id
        reason = optional_audit_reason(self.request)
        mp, scope = instance.month_period, instance.scope
        with transaction.atomic():
            instance.delete()
            AuditLogService.log_delete(
                self.request.user,
                instance,
                before_state,
                object_id_override=object_id,
                reason=reason,
            )
        invalidate_for_expense_actual_write(invalidate_monthly_pairs=[(mp, scope)])
