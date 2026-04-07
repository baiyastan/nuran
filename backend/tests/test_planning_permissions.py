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
    month_period = MonthPeriod.objects.create(month='2024-01', status='OPEN', planning_open=True)
    return PlanPeriod.objects.create(
        project=project,
        period='2024-01',
        status='draft',
        fund_kind='project',
        month_period=month_period,
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
    return MonthPeriod.objects.create(month='2024-02', status='OPEN', planning_open=True)


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

    def test_foreman_can_create_plan_period_without_project_assignment(
        self, api_client, foreman_user, unassigned_project, month_period
    ):
        """Foreman can create a project PlanPeriod without any ProjectAssignment."""
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

        data = {
            'fund_kind': 'project',
            'project': unassigned_project.id,
            'period': month_period.month,
        }
        response = api_client.post('/api/v1/plan-periods/', data)
        assert response.status_code == 201

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

    def test_foreman_can_repoint_plan_period_to_different_project_without_assignment(
        self, api_client, foreman_user, plan_period
    ):
        """Foreman may PATCH plan period to another project without ProjectAssignment."""
        from rest_framework_simplejwt.tokens import RefreshToken
        ProjectAssignment.objects.filter(prorab=foreman_user).delete()

        other_project = Project.objects.create(
            name='Other Project',
            status='active',
            created_by=plan_period.created_by
        )
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.patch(
            f'/api/v1/plan-periods/{plan_period.id}/',
            {'project': other_project.id},
        )
        assert response.status_code == 200
        assert response.data['project'] == other_project.id

    def test_foreman_can_delete_plan_period_without_assignment(
        self, api_client, foreman_user, plan_period
    ):
        """Foreman can delete a project PlanPeriod without ProjectAssignment."""
        from rest_framework_simplejwt.tokens import RefreshToken
        ProjectAssignment.objects.filter(project=plan_period.project, prorab=foreman_user).delete()

        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.delete(f'/api/v1/plan-periods/{plan_period.id}/')
        assert response.status_code == 204

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
        message = str(response.data).lower()
        assert 'cannot' in message
        assert 'create/update' in message
    
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
    
    def test_director_cannot_submit_but_can_approve(self, api_client, foreman_user, director_user, plan_period):
        """Director cannot submit, but can approve submitted plans."""
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.planning.services import PlanPeriodService
        
        # Director cannot submit
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 403

        # Director can approve after foreman submit
        PlanPeriodService.submit(plan_period, foreman_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 200
    
    def test_foreman_can_submit_but_cannot_approve(self, api_client, foreman_user, plan_period):
        """Foreman can submit own draft, but cannot approve."""
        from rest_framework_simplejwt.tokens import RefreshToken
        
        # Foreman can submit
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 200
        
        # Foreman cannot approve
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 403

    def test_foreman_can_create_plan_item_without_project_assignment(
        self, api_client, foreman_user, plan_period
    ):
        """Planning writes do not require ProjectAssignment."""
        from rest_framework_simplejwt.tokens import RefreshToken
        ProjectAssignment.objects.filter(prorab=foreman_user).delete()
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(
            '/api/v1/plan-items/',
            {
                'plan_period': plan_period.id,
                'title': 'No assignment item',
                'qty': '1.0',
                'unit': 'u',
                'amount': '100.0',
            },
            format='json',
        )
        assert response.status_code == 201

    def test_foreman_plan_item_create_fails_when_month_locked(
        self, api_client, foreman_user, admin_user, project
    ):
        from rest_framework_simplejwt.tokens import RefreshToken
        locked = MonthPeriod.objects.create(month='2099-07', status='LOCKED', planning_open=True)
        pp = PlanPeriod.objects.create(
            project=project,
            period='2099-07',
            fund_kind='project',
            status='draft',
            month_period=locked,
            created_by=admin_user,
        )
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(
            '/api/v1/plan-items/',
            {
                'plan_period': pp.id,
                'title': 'Locked month',
                'amount': '50.0',
            },
            format='json',
        )
        assert response.status_code == 403

    def test_admin_cannot_create_plan_item_after_plan_submitted(
        self, api_client, admin_user, foreman_user, plan_period
    ):
        """Admin follows the same PlanPeriod status rules as other roles for line mutations."""
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.planning.services import PlanPeriodService

        PlanPeriodService.submit(plan_period, foreman_user)

        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(
            '/api/v1/plan-items/',
            {
                'plan_period': plan_period.id,
                'title': 'Admin late line',
                'qty': '1.0',
                'unit': 'u',
                'amount': '10.0',
            },
            format='json',
        )
        assert response.status_code == 400
        message = str(response.data).lower()
        assert 'cannot' in message
        assert 'create/update' in message

    def test_admin_cannot_update_plan_item_after_plan_submitted(
        self, api_client, admin_user, foreman_user, plan_item, plan_period
    ):
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.planning.services import PlanPeriodService

        PlanPeriodService.submit(plan_period, foreman_user)

        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.patch(
            f'/api/v1/plan-items/{plan_item.id}/',
            {'title': 'Admin patch'},
            format='json',
        )
        assert response.status_code == 400
        message = str(response.data).lower()
        assert 'cannot' in message
        assert 'create/update' in message


class TestProrabPlanItemEditability:
    """Prorab plan item writes respect ProrabPlan status (draft vs submitted)."""

    def test_foreman_prorab_plan_item_create_fails_when_prorab_plan_submitted(
        self, api_client, foreman_user, admin_user, project
    ):
        from decimal import Decimal
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.budgeting.models import ExpenseCategory
        from apps.planning.models import ProrabPlan
        from apps.planning.services import ProrabPlanService

        root = ExpenseCategory.objects.create(
            name='ProrabRoot',
            scope='project',
            parent=None,
            is_active=True,
            kind='EXPENSE',
        )
        leaf = ExpenseCategory.objects.create(
            name='ProrabLeaf',
            scope='project',
            parent=root,
            is_active=True,
            kind='EXPENSE',
        )
        mp = MonthPeriod.objects.create(month='2099-12', status='OPEN', planning_open=True)
        pp = PlanPeriod.objects.create(
            project=project,
            period='2099-12',
            fund_kind='project',
            status='draft',
            month_period=mp,
            limit_amount=Decimal('100000.00'),
            created_by=admin_user,
        )
        plan = ProrabPlan.objects.create(period=pp, prorab=foreman_user, status='draft')
        ProrabPlanService.submit_plan(plan, foreman_user)

        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(
            f'/api/v1/prorab/plans/{plan.id}/items/',
            {'plan': plan.id, 'category': leaf.id, 'name': 'AB', 'amount': '10.00'},
            format='json',
        )
        assert response.status_code == 409


class TestForemanPostedFactsStillBlocked:
    """Foreman must not write posted financial facts (regression)."""

    def test_foreman_cannot_post_income_entry(self, api_client, foreman_user, admin_user, project):
        from rest_framework_simplejwt.tokens import RefreshToken
        from apps.finance.models import FinancePeriod, IncomeSource

        mp = MonthPeriod.objects.create(month='2099-08', status='OPEN')
        fp = FinancePeriod.objects.create(
            month_period=mp,
            fund_kind='project',
            project=project,
            created_by=admin_user,
        )
        src = IncomeSource.objects.create(name='Src', is_active=True)
        token = RefreshToken.for_user(foreman_user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
        response = api_client.post(
            '/api/v1/income-entries/',
            {
                'finance_period': fp.id,
                'source_id': src.id,
                'account': 'CASH',
                'amount': '10.00',
                'received_at': '2099-08-10',
                'comment': 'blocked',
            },
            format='json',
        )
        assert response.status_code == 403


class TestPlanPeriodWorkflowActions:
    """Regression coverage for PlanPeriod workflow actions."""

    def _auth(self, api_client, user):
        from rest_framework_simplejwt.tokens import RefreshToken
        token = RefreshToken.for_user(user)
        api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    def test_foreman_can_submit_plan_period(self, api_client, foreman_user, plan_period):
        self._auth(api_client, foreman_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/submit/')
        assert response.status_code == 200
        assert response.data['status'] == 'submitted'

    def test_director_can_approve_plan_period(self, api_client, foreman_user, director_user, plan_period):
        from apps.planning.services import PlanPeriodService
        PlanPeriodService.submit(plan_period, foreman_user)
        self._auth(api_client, director_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/approve/')
        assert response.status_code == 200
        assert response.data['status'] == 'approved'

    def test_admin_can_lock_plan_period(self, api_client, foreman_user, admin_user, plan_period):
        from apps.planning.services import PlanPeriodService
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, admin_user)
        self._auth(api_client, admin_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/lock/')
        assert response.status_code == 200
        assert response.data['status'] == 'locked'

    def test_admin_can_unlock_only_when_month_open(self, api_client, foreman_user, admin_user, project):
        from apps.planning.services import PlanPeriodService
        month_period = MonthPeriod.objects.create(month='2099-09', status='OPEN', planning_open=True)
        plan_period = PlanPeriod.objects.create(
            project=project,
            period='2099-09',
            fund_kind='project',
            status='draft',
            month_period=month_period,
            created_by=foreman_user,
        )
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, admin_user)
        PlanPeriodService.lock(plan_period, admin_user)
        self._auth(api_client, admin_user)

        month_period.status = 'LOCKED'
        month_period.save(update_fields=['status'])
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/unlock/')
        assert response.status_code == 403
        assert 'month is locked' in str(response.data).lower()

        month_period.status = 'OPEN'
        month_period.save(update_fields=['status'])
        response_open = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/unlock/')
        assert response_open.status_code == 200
        assert response_open.data['status'] == 'draft'

    def test_return_to_draft_endpoint_submitted_to_draft(
        self, api_client, foreman_user, director_user, plan_period
    ):
        from apps.planning.services import PlanPeriodService
        PlanPeriodService.submit(plan_period, foreman_user)
        self._auth(api_client, director_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/return-to-draft/')
        assert response.status_code == 200
        assert response.data['status'] == 'draft'

    def test_return_to_draft_endpoint_approved_to_draft(
        self, api_client, foreman_user, director_user, admin_user, plan_period
    ):
        from apps.planning.services import PlanPeriodService
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, admin_user)
        self._auth(api_client, director_user)
        response = api_client.post(f'/api/v1/plan-periods/{plan_period.id}/return-to-draft/')
        assert response.status_code == 200
        assert response.data['status'] == 'draft'

