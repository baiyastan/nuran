"""
PlanItem viewsets.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django_filters import rest_framework as filters
from .models import PlanItem
from .serializers import PlanItemSerializer
from .services import PlanItemService
from .permissions import PlanItemPermission, PlanItemApprovePermission


class PlanItemFilter(filters.FilterSet):
    """Filter for PlanItem."""
    date_from = filters.DateFilter(field_name='date', lookup_expr='gte')
    date_to = filters.DateFilter(field_name='date', lookup_expr='lte')
    cost_min = filters.NumberFilter(field_name='cost', lookup_expr='gte')
    cost_max = filters.NumberFilter(field_name='cost', lookup_expr='lte')
    
    class Meta:
        model = PlanItem
        fields = ['plan', 'status', 'approval_stage', 'created_by', 'material']


class PlanItemViewSet(viewsets.ModelViewSet):
    """ViewSet for PlanItem."""
    
    queryset = PlanItem.objects.all()
    serializer_class = PlanItemSerializer
    permission_classes = [PlanItemPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = PlanItemFilter
    search_fields = ['name', 'description', 'material']
    ordering_fields = ['created_at', 'updated_at', 'date', 'cost']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optional filtering."""
        queryset = super().get_queryset()
        return queryset.select_related('plan', 'plan__project', 'created_by')
    
    def perform_create(self, serializer):
        """Create plan item with audit logging."""
        service = PlanItemService()
        plan_item = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = plan_item
    
    def perform_update(self, serializer):
        """Update plan item with audit logging."""
        service = PlanItemService()
        service.update(
            plan_item=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete plan item with audit logging."""
        service = PlanItemService()
        service.delete(plan_item=instance, user=self.request.user)
    
    @action(detail=True, methods=['post'], permission_classes=[PlanItemApprovePermission])
    def approve(self, request, pk=None):
        """Approve a plan item."""
        plan_item = self.get_object()
        service = PlanItemService()
        
        try:
            plan_item = service.approve(plan_item, request.user)
            serializer = self.get_serializer(plan_item)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

