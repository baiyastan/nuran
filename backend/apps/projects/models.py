"""
Project models.
"""
from django.db import models
from django.conf import settings


class Project(models.Model):
    """Project model."""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('on_hold', 'On Hold'),
    ]
    
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='active'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_projects'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return self.name


class ProjectAssignment(models.Model):
    """Project assignment model - assigns projects to foremen (prorabs)."""
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='assignments'
    )
    prorab = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='project_assignments',
        limit_choices_to={'role': 'foreman'},
        help_text='Foreman (prorab) assigned to this project'
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = [['project', 'prorab']]
        indexes = [
            models.Index(fields=['project', 'prorab']),
            models.Index(fields=['prorab']),
        ]
    
    def __str__(self):
        return f"{self.project.name} - {self.prorab.email}"

