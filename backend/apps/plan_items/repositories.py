"""
PlanItem repositories.
"""
from django.db.models import Q
from django.utils import timezone
from datetime import datetime
from .models import PlanItem


class PlanItemRepository:
    """Repository for PlanItem data access."""
    
    @staticmethod
    def get_all():
        """Get all plan items."""
        return PlanItem.objects.all()
    
    @staticmethod
    def get_by_id(pk):
        """Get plan item by ID."""
        try:
            return PlanItem.objects.get(pk=pk)
        except PlanItem.DoesNotExist:
            return None
    
    @staticmethod
    def filter_by_plan(plan_id):
        """Filter plan items by plan."""
        return PlanItem.objects.filter(plan_id=plan_id)
    
    @staticmethod
    def filter_by_status(status):
        """Filter plan items by status."""
        return PlanItem.objects.filter(status=status)
    
    @staticmethod
    def filter_by_approval_stage(stage):
        """Filter plan items by approval stage."""
        return PlanItem.objects.filter(approval_stage=stage)
    
    @staticmethod
    def filter_by_created_by(user):
        """Filter plan items by creator."""
        return PlanItem.objects.filter(created_by=user)
    
    @staticmethod
    def filter_by_date_range(date_from=None, date_to=None):
        """Filter plan items by date range."""
        queryset = PlanItem.objects.all()
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        return queryset
    
    @staticmethod
    def filter_by_material(material):
        """Filter plan items by material."""
        return PlanItem.objects.filter(material__icontains=material)
    
    @staticmethod
    def filter_by_cost_range(cost_min=None, cost_max=None):
        """Filter plan items by cost range."""
        queryset = PlanItem.objects.all()
        if cost_min is not None:
            queryset = queryset.filter(cost__gte=cost_min)
        if cost_max is not None:
            queryset = queryset.filter(cost__lte=cost_max)
        return queryset
    
    @staticmethod
    def create(**kwargs):
        """Create a new plan item."""
        return PlanItem.objects.create(**kwargs)
    
    @staticmethod
    def update(instance, **kwargs):
        """Update a plan item."""
        for key, value in kwargs.items():
            setattr(instance, key, value)
        instance.save()
        return instance
    
    @staticmethod
    def delete(instance):
        """Delete a plan item."""
        instance.delete()

