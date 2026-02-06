"""
Management command to assign a foreman to a project.
Usage: python manage.py assign_foreman <project_id> <foreman_email>
"""
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from apps.projects.models import Project, ProjectAssignment

User = get_user_model()


class Command(BaseCommand):
    help = 'Assign a foreman (prorab) to a project'

    def add_arguments(self, parser):
        parser.add_argument('project_id', type=int, help='Project ID')
        parser.add_argument('foreman_email', type=str, help='Foreman email address')

    def handle(self, *args, **options):
        project_id = options['project_id']
        foreman_email = options['foreman_email']

        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            raise CommandError(f'Project with ID {project_id} does not exist')

        try:
            foreman = User.objects.get(email=foreman_email, role='foreman')
        except User.DoesNotExist:
            raise CommandError(f'Foreman with email {foreman_email} does not exist or is not a foreman')

        assignment, created = ProjectAssignment.objects.get_or_create(
            project=project,
            prorab=foreman
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Successfully assigned foreman {foreman_email} to project "{project.name}"'
                )
            )
        else:
            self.stdout.write(
                self.style.WARNING(
                    f'Foreman {foreman_email} is already assigned to project "{project.name}"'
                )
            )

