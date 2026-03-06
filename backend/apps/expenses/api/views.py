"""
Expenses API views.
"""
from decimal import Decimal

from django.db.models import Sum
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets
from rest_framework.filters import OrderingFilter
from rest_framework.response import Response

from apps.expenses.models import ActualExpense
from apps.expenses.permissions import ActualExpensePermission
from .serializers import ActualExpenseSerializer


class ActualExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for ActualExpense - keyed by month + scope (OFFICE/PROJECT/CHARITY). No FinancePeriod."""

    serializer_class = ActualExpenseSerializer
    permission_classes = [ActualExpensePermission]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    # Scope is handled via filterset; category (including null) is handled explicitly in get_queryset.
    filterset_fields = ['scope']
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
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()
