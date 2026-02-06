"""
Audit log models.
"""
from django.db import models
from django.conf import settings


class AuditLog(models.Model):
    """Audit log model for tracking actions."""
    
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('approve', 'Approve'),
        ('lock', 'Lock'),
        ('submit', 'Submit'),
    ]
    
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=100)
    object_id = models.PositiveIntegerField()
    before = models.JSONField(default=dict, blank=True, null=True)
    after = models.JSONField(default=dict, blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['model_name', 'object_id']),
            models.Index(fields=['actor', '-timestamp']),
        ]
    
    def __str__(self):
        return f"{self.action} {self.model_name} #{self.object_id} by {self.actor}"

