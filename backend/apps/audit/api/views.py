"""
Audit log API views - read-only.
"""
from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import OrderingFilter
from core.permissions import IsDirector
from ..models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for AuditLog (read-only, director/admin only)."""
    
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    permission_classes = [IsDirector]
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['actor', 'action', 'model_name', 'object_id']
    ordering_fields = ['timestamp']
    ordering = ['-timestamp']
    
    def get_queryset(self):
        """Get queryset with optional filtering."""
        queryset = super().get_queryset()
        return queryset.select_related('actor')

