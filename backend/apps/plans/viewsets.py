"""
Plan viewsets.
"""
from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from .models import Plan
from .serializers import PlanSerializer
from .services import PlanService
from .permissions import PlanPermission


class PlanViewSet(viewsets.ModelViewSet):
    """ViewSet for Plan."""
    
    queryset = Plan.objects.all()
    serializer_class = PlanSerializer
    permission_classes = [PlanPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['project', 'status', 'created_by']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'updated_at', 'name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optional filtering."""
        queryset = super().get_queryset()
        return queryset.select_related('project', 'created_by')
    
    def perform_create(self, serializer):
        """Create plan with audit logging."""
        service = PlanService()
        plan = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = plan
    
    def perform_update(self, serializer):
        """Update plan with audit logging."""
        service = PlanService()
        service.update(
            plan=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete plan with audit logging."""
        service = PlanService()
        service.delete(plan=instance, user=self.request.user)

