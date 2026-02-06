"""
Projects API views.
"""
from rest_framework import viewsets
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from ..models import Project
from ..services import ProjectService
from .serializers import ProjectSerializer
from ..permissions import ProjectPermission


class ProjectViewSet(viewsets.ModelViewSet):
    """ViewSet for Project."""
    
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [ProjectPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'created_by']
    search_fields = ['name', 'description']
    ordering_fields = ['created_at', 'updated_at', 'name']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optional filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('created_by')
        
        # Foreman can only see assigned projects, exclude Office project
        if self.request.user.role == 'foreman':
            from apps.projects.models import ProjectAssignment
            assigned_project_ids = ProjectAssignment.objects.filter(
                prorab=self.request.user
            ).values_list('project_id', flat=True)
            queryset = queryset.filter(id__in=assigned_project_ids).exclude(name__iexact='office')
        
        return queryset
    
    def perform_create(self, serializer):
        """Create project with audit logging."""
        service = ProjectService()
        project = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = project
    
    def perform_update(self, serializer):
        """Update project with audit logging."""
        service = ProjectService()
        service.update(
            project=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete project with audit logging."""
        service = ProjectService()
        service.delete(project=instance, user=self.request.user)

