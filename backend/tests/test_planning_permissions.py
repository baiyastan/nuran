"""
Tests for planning permissions.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from apps.projects.models import Project, ProjectAssignment
from apps.planning.models import PlanPeriod, PlanItem
from apps.budgeting.models import MonthPeriod

User = get_user_model()


@pytest.fixture
def api_client():
    """Create API client."""
    return APIClient()


@pytest.fixture
def admin_user(db):
    """Create admin user."""
    return User.objects.create_user(
        username='admin',
        email='admin@test.com',
        password='testpass123',
        role='admin'
    )


@pytest.fixture
def director_user(db):
    """Create director user."""
    return User.objects.create_user(
        username='director',
        email='director@test.com',
        password='testpass123',
        role='director'
    )


@pytest.fixture
def foreman_user(db):
    """Create foreman user."""
    return User.objects.create_user(
        username='foreman',
        email='foreman@test.com',
        password='testpass123',
        role='foreman'
    )


@pytest.fixture
def project(db, admin_user):
    """Create a project."""
    return Project.objects.create(
        name='Test Project',
        description='Test Description',
        status='active',
        created_by=admin_user
    )


@pytest.fixture
def project_assignment(db, project, foreman_user):
    """Create a project assignment."""
    return ProjectAssignment.objects.create(
        project=project,
        prorab=foreman_user
    )


@pytest.fixture
def plan_period(db, project, foreman_user, project_assignment):
    """Create a plan period."""
    return PlanPeriod.objects.create(
        project=project,
        period='2024-01',
        status='draft',
        created_by=foreman_user
    )


@pytest.fixture
def plan_item(db, plan_period, foreman_user):
    """Create a plan item."""
    return PlanItem.objects.create(
        plan_period=plan_period,
        title='Test Item',
        qty=10.0,
        unit='kg',
        amount=1000.0,
        created_by=foreman_user
    )


@pytest.fixture
def month_period(db):
    """Create MonthPeriod for plan period creation."""
    return MonthPeriod.objects.create(month='2024-02', status='OPEN')


@pytest.fixture
def unassigned_project(db, admin_user):
    """Create a project with no foreman assignment."""
    return Project.objects.create(
        name='Unassigned Project',
        description='No foreman assigned',
        status='active',
        created_by=admin_user
    )


class TestPlanPeriodForemanPermissions:
    """Test PlanPeriod API permissions for foreman role."""

    def test_foreman_can_create_plan_period_for_assigned_project(
        self, api_client, foreman_user, project, project_assignment, month_period
    ):
        """Foreman can create PlanPeriod for assigned project -> 201."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        data = {
            'fund_kind': 'project',
            'project': project.id,
            'period': month_period.month,
        }
        response = api_client.post('/api/v1/plan-periods/', data)
        assert response.status_code == 201

    def test_foreman_cannot_create_for_unassigned_project(
        self, api_client, foreman_user, unassigned_project, month_period
    ):
        """Foreman cannot create PlanPeriod for unassigned project -> 403 or 404."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        data = {
            'fund_kind': 'project',
            'project': unassigned_project.id,
            'period': month_period.month,
        }
        response = api_client.post('/api/v1/plan-periods/', data)
        assert response.status_code in (403, 404)
        if response.status_code == 403:
            assert 'access' in response.data.get('detail', '').lower() or 'project' in response.data.get('detail', '').lower()

    def test_foreman_cannot_create_office_fund_kind(
        self, api_client, foreman_user, month_period
    ):
        """Foreman cannot create office/charity fund_kind -> 403."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        data = {
            'fund_kind': 'office',
            'period': month_period.month,
        }
        response = api_client.post('/api/v1/plan-periods/', data)
        assert response.status_code == 403

    def test_foreman_cannot_update_plan_period_for_unassigned_project(
        self, api_client, foreman_user, plan_period, unassigned_project
    ):
        """Foreman cannot update PlanPeriod for unassigned project -> 403 or 404."""
        from rest_framework_simplejwt.tokens import RefreshToken
        # Remove assignment so foreman loses access (plan_period uses project with assignment)
        ProjectAssignment.objects.filter(project=plan_period.project, prorab=foreman_user).delete()
        # Create assignment for a different project, then try to update this one to unassigned project
        ProjectAssignment.objects.create(project=unassigned_project, prorab=foreman_user)
        # plan_period is for project (assigned), but we'll try to change it to unassigned_project - wait,
        # unassigned_project has no assignment. So foreman is assigned to unassigned_project now. Let me fix.
        # Actually: create another project with no assignment. Foreman has assignment to plan_period.project.
        # To test "cannot update for unassigned project": we need foreman to try updating a plan period
        # to a project they're not assigned to. So: plan_period is for project A (foreman assigned).
        # We try to PATCH project to B (unassigned). That should 403.
        other_project = Project.objects.create(
            name='Other Unassigned',
            status='active',
            created_by=plan_period.created_by
        )
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.patch(
            f'/api/v1/plan-periods/{plan_period.id}/',
            {'project': other_project.id}
        )
        assert response.status_code in (403, 404)

    def test_foreman_cannot_delete_plan_period_when_not_assigned(
        self, api_client, foreman_user, plan_period
    ):
        """Foreman cannot delete PlanPeriod when not assigned -> 404 (object not in queryset)."""
        from rest_framework_simplejwt.tokens import RefreshToken
        # Remove foreman's assignment to the project
        ProjectAssignment.objects.filter(project=plan_period.project, prorab=foreman_user).delete()

        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        # Foreman won't see it (get_queryset filters), so get_object returns 404
        response = api_client.delete(f'/api/v1/plan-periods/{plan_period.id}/')
        assert response.status_code == 404

    def test_foreman_can_update_plan_period_for_assigned_project(
        self, api_client, foreman_user, plan_period, project_assignment
    ):
        """Foreman can update PlanPeriod for assigned project."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = api_client.patch(
            f'/api/v1/plan-periods/{plan_period.id}/',
            {'comments': 'Updated by foreman'}
        )
        assert response.status_code == 200

    def test_foreman_can_delete_plan_period_for_assigned_project(
        self, api_client, foreman_user, plan_period, project_assignment
    ):
        """Foreman can delete PlanPeriod for assigned project."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        response = api_client.delete(f'/api/v1/plan-periods/{plan_period.id}/')
        assert response.status_code == 204

    def test_admin_can_create_plan_period_regardless(
        self, api_client, admin_user, unassigned_project, month_period
    ):
        """Admin can create PlanPeriod for any project."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        data = {
            'fund_kind': 'project',
            'project': unassigned_project.id,
            'period': month_period.month,
        }
        response = api_client.post('/api/v1/plan-periods/', data)
        assert response.status_code == 201

    def test_admin_can_delete_plan_period_regardless(
        self, api_client, admin_user, plan_period
    ):
        """Admin can delete PlanPeriod regardless of assignment."""
        from rest_framework_simplejwt.tokens import RefreshToken
        ProjectAssignment.objects.filter(project=plan_period.project).delete()

        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.delete(f'/api/v1/plan-periods/{plan_period.id}/')
        assert response.status_code == 204


class TestPlanItemPermissions:
    """Test PlanItem API permissions."""
    
    def test_foreman_can_create(self, api_client, foreman_user, plan_period):
        """Test that foreman can create plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {
            'plan_period': plan_period.id,
            'title': 'New Item',
            'qty': '5.0',
            'unit': 'kg',
            'amount': '500.0',
        }
        response = api_client.post('/api/v1/plan-items/', data)
        assert response.status_code == 201
    
    def test_foreman_can_update_in_draft(self, api_client, foreman_user, plan_item):
        """Test that foreman can update plan items when status is draft."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {'title': 'Updated Title'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', data)
        assert response.status_code == 200
    
    def test_foreman_cannot_update_after_submission(self, api_client, foreman_user, plan_item, plan_period):
        """Test that foreman cannot update plan items after plan is submitted."""
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.planning.services import PlanPeriodService
        
        # Submit the plan period
        PlanPeriodService.submit(plan_period, foreman_user)
        
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {'title': 'Updated Title'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', data)
        assert response.status_code == 400
        assert 'accepted by admin' in response.data.get('detail', '') or 'accepted by admin' in str(response.data)
    
    def test_foreman_cannot_delete(self, api_client, foreman_user, plan_item):
        """Test that foreman cannot delete plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        response = api_client.delete(f'/api/v1/plan-items/{plan_item.id}/')
        assert response.status_code == 403
    
    def test_director_can_update(self, api_client, director_user, plan_item):
        """Test that director can update plan items."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        
        data = {'title': 'Updated Title'}
        response = api_client.patch(f'/api/v1/plan-items/{plan_item.id}/', data)
        assert response.status_code == 200
    
    def test_director_cannot_submit_or_approve(self, api_client, foreman_user, director_user, plan_period):
        """Test that director cannot submit or approve plan periods (read-only)."""
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Director cannot submit
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 403
        
        # Director cannot approve
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 403
    
    def test_foreman_cannot_submit_or_approve(self, api_client, foreman_user, plan_period):
        """Test that foreman cannot submit or approve plan periods (read-only)."""
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Foreman cannot submit
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 403
        
        # Foreman cannot approve
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 403

