"""
Actuals models.
"""
from django.db import models
from django.conf import settings
from apps.planning.models import PlanPeriod


class ActualItem(models.Model):
    """Actual item model - for plan vs actual comparison."""
    
    plan_period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.CASCADE,
        related_name='actual_items'
    )
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=50)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_actual_items'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['plan_period', 'created_at']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.plan_period}"

