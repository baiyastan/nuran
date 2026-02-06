"""
Plan repositories.
"""
from .models import Plan


class PlanRepository:
    """Repository for Plan data access."""
    
    @staticmethod
    def get_all():
        """Get all plans."""
        return Plan.objects.all()
    
    @staticmethod
    def get_by_id(pk):
        """Get plan by ID."""
        try:
            return Plan.objects.get(pk=pk)
        except Plan.DoesNotExist:
            return None
    
    @staticmethod
    def filter_by_project(project_id):
        """Filter plans by project."""
        return Plan.objects.filter(project_id=project_id)
    
    @staticmethod
    def filter_by_status(status):
        """Filter plans by status."""
        return Plan.objects.filter(status=status)
    
    @staticmethod
    def filter_by_created_by(user):
        """Filter plans by creator."""
        return Plan.objects.filter(created_by=user)
    
    @staticmethod
    def create(**kwargs):
        """Create a new plan."""
        return Plan.objects.create(**kwargs)
    
    @staticmethod
    def update(instance, **kwargs):
        """Update a plan."""
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save()
        return instance
    
    @staticmethod
    def delete(instance):
        """Delete a plan."""
        instance.delete()

