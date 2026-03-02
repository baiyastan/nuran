"""
Expenses API views.
"""
from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from apps.expenses.models import ActualExpense
from .serializers import ActualExpenseSerializer
from apps.expenses.permissions import ActualExpensePermission


class ActualExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for ActualExpense - keyed by month + scope (OFFICE/PROJECT/CHARITY). No FinancePeriod."""

    serializer_class = ActualExpenseSerializer
    permission_classes = [ActualExpensePermission]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['category', 'scope']
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

    def perform_create(self, serializer):
        serializer.save()

    def perform_update(self, serializer):
        serializer.save()

    def perform_destroy(self, instance):
        instance.delete()
