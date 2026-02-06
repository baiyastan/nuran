"""
Project repositories.
"""
from django.db.models import Q
from .models import Project


class ProjectRepository:
    """Repository for Project data access."""
    
    @staticmethod
    def get_all():
        """Get all projects."""
        return Project.objects.all()
    
    @staticmethod
    def get_by_id(pk):
        """Get project by ID."""
        try:
            return Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return None
    
    @staticmethod
    def filter_by_status(status):
        """Filter projects by status."""
        return Project.objects.filter(status=status)
    
    @staticmethod
    def filter_by_created_by(user):
        """Filter projects by creator."""
        return Project.objects.filter(created_by=user)
    
    @staticmethod
    def create(**kwargs):
        """Create a new project."""
        return Project.objects.create(**kwargs)
    
    @staticmethod
    def update(instance, **kwargs):
        """Update a project."""
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save()
        return instance
    
    @staticmethod
    def delete(instance):
        """Delete a project."""
        instance.delete()

