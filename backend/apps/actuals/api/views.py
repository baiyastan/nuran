"""
Actuals API views.
"""
from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from ..models import ActualItem
from ..services import ActualItemService
from .serializers import ActualItemSerializer
from ..permissions import ActualItemPermission


class ActualItemViewSet(viewsets.ModelViewSet):
    """ViewSet for ActualItem."""
    
    queryset = ActualItem.objects.all()
    serializer_class = ActualItemSerializer
    permission_classes = [ActualItemPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['plan_period', 'category']
    search_fields = ['title', 'category', 'note']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optimized queries."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'plan_period',
            'plan_period__project',
            'created_by'
        )
        return queryset
    
    def perform_create(self, serializer):
        """Create actual item with audit logging."""
        service = ActualItemService()
        actual_item = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = actual_item
    
    def perform_update(self, serializer):
        """Update actual item with audit logging."""
        service = ActualItemService()
        service.update(
            actual_item=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete actual item with audit logging."""
        service = ActualItemService()
        service.delete(actual_item=instance, user=self.request.user)

