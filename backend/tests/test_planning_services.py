"""
Tests for planning services.
"""
import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from apps.projects.models import Project
from apps.planning.models import PlanPeriod, PlanItem
from apps.planning.services import PlanPeriodService, PlanItemService
from apps.budgeting.models import MonthPeriod

User = get_user_model()


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
def plan_period(db, project, foreman_user):
    """Create a draft plan period."""
    month_period = MonthPeriod.objects.create(month='2024-01', status='OPEN', planning_open=True)
    return PlanPeriod.objects.create(
        project=project,
        period='2024-01',
        fund_kind='project',
        status='draft',
        month_period=month_period,
        created_by=foreman_user
    )


class TestPlanPeriodService:
    """Test PlanPeriodService."""
    
    def test_submit_draft(self, plan_period, foreman_user):
        """Test submitting a draft plan period."""
        service = PlanPeriodService()
        plan_period = service.submit(plan_period, foreman_user)
        
        assert plan_period.status == 'submitted'
        assert plan_period.submitted_at is not None
    
    def test_submit_non_draft_fails(self, plan_period, foreman_user):
        """Test that non-draft plan periods cannot be submitted."""
        plan_period.status = 'submitted'
        plan_period.save()
        
        service = PlanPeriodService()
        with pytest.raises(ValidationError):
            service.submit(plan_period, foreman_user)
    
    def test_approve_submitted(self, plan_period, foreman_user, director_user):
        """Test approving a submitted plan period."""
        # First submit
        PlanPeriodService.submit(plan_period, foreman_user)
        
        # Then approve
        service = PlanPeriodService()
        plan_period = service.approve(plan_period, director_user)
        
        assert plan_period.status == 'approved'
        assert plan_period.approved_at is not None
    
    def test_foreman_cannot_approve(self, plan_period, foreman_user):
        """Test that foreman cannot approve."""
        PlanPeriodService.submit(plan_period, foreman_user)
        
        service = PlanPeriodService()
        with pytest.raises(ValidationError):
            service.approve(plan_period, foreman_user)
    
    def test_lock_approved(self, plan_period, foreman_user, director_user, admin_user):
        """Test locking an approved plan period."""
        # Submit and approve
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, director_user)
        
        # Lock
        service = PlanPeriodService()
        plan_period = service.lock(plan_period, admin_user)
        
        assert plan_period.status == 'locked'
        assert plan_period.locked_at is not None
    
    def test_non_admin_cannot_lock(self, plan_period, foreman_user, director_user):
        """Test that only admin can lock."""
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, director_user)
        
        service = PlanPeriodService()
        with pytest.raises(ValidationError):
            service.lock(plan_period, director_user)


class TestPlanItemService:
    """Test PlanItemService."""
    
    def test_foreman_can_create_in_draft(self, plan_period, foreman_user):
        """Test that foreman can create plan items in draft period."""
        service = PlanItemService()
        plan_item = service.create(
            user=foreman_user,
            plan_period=plan_period,
            title='Test Item',
            qty=10.0,
            unit='kg',
            amount=1000.0
        )
        
        assert plan_item.title == 'Test Item'
        assert plan_item.created_by == foreman_user
    
    def test_foreman_cannot_create_in_locked(self, plan_period, foreman_user, admin_user):
        """Test that foreman cannot create items in locked period."""
        PlanPeriodService.submit(plan_period, foreman_user)
        PlanPeriodService.approve(plan_period, admin_user)  # director would approve, but admin can too
        PlanPeriodService.lock(plan_period, admin_user)
        
        service = PlanItemService()
        with pytest.raises(ValidationError):
            service.create(
                user=foreman_user,
                plan_period=plan_period,
                title='Test Item',
                qty=10.0,
                unit='kg',
                amount=1000.0
            )
    
    def test_foreman_can_modify_in_draft(self, plan_period, foreman_user):
        """Test that foreman can modify plan items when status is draft."""
        plan_item = PlanItem.objects.create(
            plan_period=plan_period,
            title='Test Item',
            qty=10.0,
            unit='kg',
            amount=1000.0,
            created_by=foreman_user
        )
        
        assert PlanItemService.can_modify(plan_item, foreman_user) is True
    
    def test_foreman_cannot_modify_after_submission(self, plan_period, foreman_user, director_user):
        """Test that foreman cannot modify plan items after plan is submitted."""
        # Submit the plan period
        PlanPeriodService.submit(plan_period, foreman_user)
        
        plan_item = PlanItem.objects.create(
            plan_period=plan_period,
            title='Test Item',
            qty=10.0,
            unit='kg',
            amount=1000.0,
            created_by=foreman_user
        )
        
        assert PlanItemService.can_modify(plan_item, foreman_user) is False
    
    def test_director_can_modify(self, plan_period, foreman_user, director_user):
        """Test that director can modify plan items."""
        plan_item = PlanItem.objects.create(
            plan_period=plan_period,
            title='Test Item',
            qty=10.0,
            unit='kg',
            amount=1000.0,
            created_by=foreman_user
        )
        
        assert PlanItemService.can_modify(plan_item, director_user) is True

