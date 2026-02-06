"""
Project services - business logic layer.
"""
from django.db import IntegrityError
from apps.audit.services import AuditLogService
from .models import Project, ProjectAssignment


class ProjectService:
    """Service for Project business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new project."""
        # Extract prorab_id if provided
        prorab_id = data.pop('prorab_id', None)
        
        data['created_by'] = user
        project = Project.objects.create(**data)
        
        # Create ProjectAssignment if prorab_id provided
        if prorab_id is not None:
            try:
                ProjectAssignment.objects.get_or_create(
                    project=project,
                    prorab_id=prorab_id
                )
            except IntegrityError:
                # Assignment already exists (shouldn't happen with get_or_create, but handle gracefully)
                pass
        
        # Audit log
        AuditLogService.log_create(user, project)
        
        return project
    
    @staticmethod
    def update(project, user, **data):
        """Update a project."""
        # Extract prorab_id if provided
        prorab_id = data.pop('prorab_id', None)
        
        # Capture before state for audit log
        before_state = {}
        for field in project._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(project, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        # Update project fields
        for key, value in data.items():
            setattr(project, key, value)
        project.save()
        
        # Handle ProjectAssignment
        assignment = ProjectAssignment.objects.filter(project=project).first()
        
        if prorab_id is not None:
            # Create or update assignment
            if assignment:
                if assignment.prorab_id != prorab_id:
                    assignment.prorab_id = prorab_id
                    assignment.save()
            else:
                try:
                    ProjectAssignment.objects.create(project=project, prorab_id=prorab_id)
                except IntegrityError:
                    # Assignment already exists (shouldn't happen, but handle gracefully)
                    pass
        elif assignment:
            # Remove assignment if prorab_id is null
            assignment.delete()
        
        # Audit log
        AuditLogService.log_update(user, project, before_state)
        
        return project
    
    @staticmethod
    def delete(project, user):
        """Delete a project."""
        before_state = {
            'id': project.id,
            'name': project.name,
            'status': project.status,
        }
        
        project.delete()
        
        # Audit log
        AuditLogService.log_delete(user, project, before_state)
    
    @staticmethod
    def ensure_office_project():
        """Ensure Office project exists (for office expenses)."""
        office_project, created = Project.objects.get_or_create(
            name='Office',
            defaults={
                'description': 'Office expenses project',
                'status': 'active',
            }
        )
        return office_project