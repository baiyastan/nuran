"""
Planning services - business logic layer.
"""
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from decimal import Decimal
import logging
from apps.audit.services import AuditLogService
from apps.reports.invalidation import invalidate_dashboard_kpi_for_month_period
from apps.finance.services import (
    FinancePeriodService,
    assert_month_open_for_planning,
    assert_month_open_for_posted_facts,
)
from apps.finance.models import FinancePeriod
from apps.finance.constants import MONTH_REQUIRED_MSG
from .models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense, Expense
from .constants import PLAN_PERIOD_MODIFY_BLOCKED_STATUSES, PLAN_PERIOD_NOT_EDITABLE_MSG
from apps.budgeting.models import MonthPeriod

logger = logging.getLogger(__name__)


def assert_plan_editing_allowed(month_period, user):
    """Require OPEN MonthPeriod for planning mutations (all roles). user is unused; kept for call sites."""
    assert_month_open_for_planning(month_period)


def assert_plan_editable(plan_period):
    """PlanPeriod content mutations (plan items, planning expenses, etc.): not allowed in blocked statuses."""
    if plan_period is None:
        raise ValidationError("Plan period is required.")
    if plan_period.status in PLAN_PERIOD_MODIFY_BLOCKED_STATUSES:
        raise ValidationError(PLAN_PERIOD_NOT_EDITABLE_MSG)


def is_plan_period_editable(plan_period):
    """True when PlanPeriod allows structural planning writes (items, prorab lines tied to period, etc.)."""
    return (
        plan_period is not None
        and plan_period.status not in PLAN_PERIOD_MODIFY_BLOCKED_STATUSES
    )


def assert_foreman_project_plan_period_scope(plan_period):
    """Foreman planning targets project-scoped plan periods only (no ProjectAssignment check)."""
    if plan_period.fund_kind != 'project':
        raise ValidationError('Foreman can only work with project plan periods.')
    if not plan_period.project_id:
        raise ValidationError('A project is required for project plan periods.')


class PlanPeriodService:
    """Service for PlanPeriod business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new plan period."""
        # Link to MonthPeriod if period is provided
        period_str = data.get('period')
        month_period = None
        if period_str:
            # Require an existing MonthPeriod; do not auto-create.
            month_value = period_str.strip()
            try:
                month_period = MonthPeriod.objects.get(month=month_value)
            except MonthPeriod.DoesNotExist:
                raise ValidationError(MONTH_REQUIRED_MSG)
            data['month_period'] = month_period
        
        # Check month period lock status before creating
        assert_plan_editing_allowed(month_period, user)
        
        data['created_by'] = user
        plan_period = PlanPeriod.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, plan_period)
        
        return plan_period
    
    @staticmethod
    def update(plan_period, user, **data):
        """Update a plan period."""
        # Check month period lock status before updating
        month_period = data.get('month_period', plan_period.month_period)
        assert_plan_editing_allowed(month_period, user)
        
        before_state = {}
        for field in plan_period._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(plan_period, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        for key, value in data.items():
            setattr(plan_period, key, value)
        plan_period.save()
        
        # Audit log
        AuditLogService.log_update(user, plan_period, before_state)
        
        return plan_period
    
    @staticmethod
    def submit(plan_period, user):
        """Submit a plan period for approval."""
        assert_month_open_for_planning(plan_period.month_period)
        if plan_period.status != 'draft':
            raise ValidationError("Only draft plan periods can be submitted")
        
        if plan_period.created_by != user and user.role != 'admin':
            raise ValidationError("Only the creator or admin can submit a plan period")
        
        before_state = {'status': plan_period.status}
        plan_period.status = 'submitted'
        plan_period.submitted_at = timezone.now()
        plan_period.save()
        
        # Audit log
        AuditLogService.log(user, 'submit', plan_period, before=before_state, after={'status': 'submitted'})
        
        return plan_period
    
    @staticmethod
    def approve(plan_period, user, comments=''):
        """Approve a plan period."""
        assert_month_open_for_planning(plan_period.month_period)
        if plan_period.status != 'submitted':
            raise ValidationError("Only submitted plan periods can be approved")
        
        if user.role not in ('director', 'admin'):
            raise ValidationError("Only director or admin can approve plan periods")
        
        before_state = {'status': plan_period.status}
        plan_period.status = 'approved'
        plan_period.approved_at = timezone.now()
        if comments:
            plan_period.comments = comments
        plan_period.save()
        
        # Audit log
        AuditLogService.log(user, 'approve', plan_period, before=before_state, after={'status': 'approved'})
        
        return plan_period
    
    @staticmethod
    def return_to_draft(plan_period, user, comments=''):
        """Return a plan period to draft status."""
        assert_month_open_for_planning(plan_period.month_period)
        if plan_period.status not in ('submitted', 'approved'):
            raise ValidationError("Only submitted or approved plan periods can be returned to draft")
        
        if user.role not in ('director', 'admin'):
            raise ValidationError("Only director or admin can return plan periods to draft")
        
        before_state = {'status': plan_period.status}
        plan_period.status = 'draft'
        if comments:
            plan_period.comments = comments
        plan_period.save()
        
        # Audit log
        AuditLogService.log(user, 'update', plan_period, before=before_state, after={'status': 'draft'})
        
        return plan_period
    
    @staticmethod
    def lock(plan_period, user):
        """Lock a plan period (final state)."""
        assert_month_open_for_planning(plan_period.month_period)
        if plan_period.status != 'approved':
            raise ValidationError("Only approved plan periods can be locked")
        
        if user.role != 'admin':
            raise ValidationError("Only admin can lock plan periods")
        
        before_state = {'status': plan_period.status}
        plan_period.status = 'locked'
        plan_period.locked_at = timezone.now()
        plan_period.save()
        
        # Audit log
        AuditLogService.log(user, 'lock', plan_period, before=before_state, after={'status': 'locked'})
        
        return plan_period


class PlanItemService:
    """Service for PlanItem business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new plan item (append-only)."""
        plan_period = data.get('plan_period')
        
        # Director is read-only
        if user.role == 'director':
            raise ValidationError("Director cannot create plan items")
        
        # Check month period lock status before creating
        month_period = plan_period.month_period if plan_period else None
        assert_plan_editing_allowed(month_period, user)
        assert_plan_editable(plan_period)

        if user.role == 'admin':
            data['created_by'] = user
            plan_item = PlanItem.objects.create(**data)
            AuditLogService.log_create(user, plan_item)
            return plan_item

        if user.role == 'foreman':
            assert_foreman_project_plan_period_scope(plan_period)

        data['created_by'] = user
        plan_item = PlanItem.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, plan_item)
        
        return plan_item
    
    @staticmethod
    def can_modify(plan_item, user):
        """Check if user can modify a plan item."""
        # Admin can always modify
        if user.role == 'admin':
            return True
        
        # Director can modify when plan period status is 'draft' or 'open' (legacy alias)
        if user.role == 'director':
            status = plan_item.plan_period.status
            return status in ('draft', 'open')
        
        # Foreman can modify if plan period is not yet accepted by admin
        if user.role == 'foreman':
            return plan_item.plan_period.status not in PLAN_PERIOD_MODIFY_BLOCKED_STATUSES
        
        return False
    
    @staticmethod
    def update(plan_item, user, **data):
        """Update a plan item."""
        # Check month period lock status before updating
        month_period = plan_item.plan_period.month_period if plan_item.plan_period else None
        assert_plan_editing_allowed(month_period, user)
        assert_plan_editable(plan_item.plan_period)

        if user.role == 'admin':
            pass
        elif user.role == 'foreman':
            assert_foreman_project_plan_period_scope(plan_item.plan_period)
        elif user.role == 'director':
            status = plan_item.plan_period.status
            if status not in ('draft', 'open'):
                raise ValidationError(
                    "Director cannot update plan items when plan period is not in draft status"
                )
        elif not PlanItemService.can_modify(plan_item, user):
            raise ValidationError("You do not have permission to modify this plan item")
        
        before_state = {}
        for field in plan_item._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(plan_item, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        for key, value in data.items():
            setattr(plan_item, key, value)
        plan_item.save()
        
        # Audit log
        AuditLogService.log_update(user, plan_item, before_state)
        
        return plan_item
    
    @staticmethod
    def delete(plan_item, user):
        """Delete a plan item."""
        # Check month period lock status before deleting
        month_period = plan_item.plan_period.month_period if plan_item.plan_period else None
        assert_plan_editing_allowed(month_period, user)
        assert_plan_editable(plan_item.plan_period)

        if not PlanItemService.can_modify(plan_item, user):
            raise ValidationError("You do not have permission to delete this plan item")
        
        # Capture object_id BEFORE deletion (pk becomes None after delete)
        object_id = plan_item.pk
        
        before_state = {
            'id': plan_item.id,
            'title': plan_item.title,
            'plan_period_id': plan_item.plan_period_id,
        }
        
        plan_item.delete()
        
        # Audit log with object_id captured before deletion
        AuditLogService.log_delete(user, plan_item, before_state, object_id_override=object_id)


class ProrabPlanService:
    """Service for ProrabPlan business logic."""
    
    @staticmethod
    def get_or_create_plan(period, prorab):
        """Get or create a DRAFT plan for the given period and prorab."""
        try:
            plan, created = ProrabPlan.objects.get_or_create(
                period=period,
                prorab=prorab,
                defaults={'status': 'draft', 'total_amount': 0}
            )
        except IntegrityError:
            # Race condition: plan was created by another request, refetch
            plan = ProrabPlan.objects.get(period=period, prorab=prorab)
            created = False
        
        if created:
            # Audit log
            AuditLogService.log_create(prorab, plan)
        
        return plan
    
    @staticmethod
    def can_edit(plan, prorab):
        """Check if prorab can edit the plan."""
        # Must be the plan owner
        if plan.prorab != prorab:
            return False
        
        if not is_plan_period_editable(plan.period):
            return False

        if plan.status not in ('draft', 'rejected'):
            return False

        return True
    
    @staticmethod
    def submit_plan(plan, prorab):
        """Submit a plan for approval."""
        if not ProrabPlanService.can_edit(plan, prorab):
            raise ValidationError(
                "Plan cannot be submitted. Plan period must be editable, and plan must be DRAFT or REJECTED."
            )
        
        if plan.status != 'draft':
            raise ValidationError("Only draft plans can be submitted")
        
        before_state = {'status': plan.status}
        plan.status = 'submitted'
        plan.submitted_at = timezone.now()
        plan.save()
        
        # Audit log
        AuditLogService.log(prorab, 'submit', plan, before=before_state, after={'status': 'submitted'})
        
        return plan
    
    @staticmethod
    def calculate_total(plan):
        """Calculate total amount from plan items."""
        total = ProrabPlanItem.objects.filter(plan=plan).aggregate(
            total=Sum('amount')
        )['total'] or 0
        
        plan.total_amount = total
        plan.save(update_fields=['total_amount'])
        
        return plan
    
    @staticmethod
    def check_limit_amount(plan):
        """Check if plan total exceeds period limit amount."""
        from core.exceptions import LimitExceededError
        
        period = plan.period
        if period.limit_amount is not None:
            if plan.total_amount > period.limit_amount:
                raise LimitExceededError(
                    detail=f'Total amount {plan.total_amount} exceeds limit {period.limit_amount}'
                )


class ActualExpenseService:
    """Service for ActualExpense business logic."""
    
    @staticmethod
    def calculate_totals(prorab_plan):
        """Calculate planned, spent, and remaining totals for a prorab plan."""
        # Planned total from plan items
        planned_total = ProrabPlanItem.objects.filter(plan=prorab_plan).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        
        # Spent total from actual expenses linked to this plan
        spent_total = ActualExpense.objects.filter(prorab_plan=prorab_plan).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0.00')
        
        # Remaining
        remaining = planned_total - spent_total
        
        return {
            'planned_total': planned_total,
            'spent_total': spent_total,
            'remaining': remaining,
        }
    
    @staticmethod
    def get_expenses_for_plan(prorab_plan):
        """Get all actual expenses linked to a prorab plan."""
        return ActualExpense.objects.filter(
            prorab_plan=prorab_plan
        ).select_related(
            'project',
            'created_by'
        ).order_by('-spent_at', '-created_at')
    
    @staticmethod
    def _get_or_assign_category(expense_name, finance_period):
        """Get or assign category for an expense based on name matching or default."""
        from apps.budgeting.models import ExpenseCategory
        
        # Map fund_kind to scope
        scope_map = {'project': 'project', 'office': 'office', 'charity': 'charity'}
        scope = scope_map.get(finance_period.fund_kind, 'project')
        
        # Try to find matching category by name (normalized, case-insensitive)
        normalized_name = expense_name.strip().lower()
        category = ExpenseCategory.objects.filter(
            scope=scope,
            name__iexact=normalized_name,
            is_active=True,
            kind='EXPENSE'
        ).first()
        
        if not category:
            # Get or create default "Башка" category for this scope
            default_category, _ = ExpenseCategory.objects.get_or_create(
                name='Башка',
                scope=scope,
                parent=None,
                kind='EXPENSE',
                defaults={'is_active': True}
            )
            category = default_category
        
        return category
    
    @staticmethod
    def create(user, **data):
        """Create a new actual expense."""
        # Validate finance_period is provided
        finance_period = data.get('finance_period')
        if not finance_period:
            raise ValidationError("finance_period is required")

        assert_month_open_for_posted_facts(finance_period.month_period)

        # Validate comment is not empty
        comment = data.get('comment', '').strip()
        if not comment:
            raise ValidationError("Comment is required and cannot be empty.")
        
        # Auto-assign category if not provided
        if not data.get('category'):
            expense_name = data.get('name', '').strip()
            if not expense_name:
                raise ValidationError("Name is required for category auto-assignment.")
            data['category'] = ActualExpenseService._get_or_assign_category(expense_name, finance_period)
        
        data['created_by'] = user
        expense = ActualExpense.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, expense)

        invalidate_dashboard_kpi_for_month_period(finance_period.month_period)
        return expense
    
    @staticmethod
    def update(expense, user, **data):
        """Update an actual expense."""
        assert_month_open_for_posted_facts(expense.finance_period.month_period)

        old_mp = expense.finance_period.month_period

        # Validate comment is not empty if provided
        if 'comment' in data:
            comment = data['comment'].strip() if data['comment'] else ''
            if not comment:
                raise ValidationError("Comment is required and cannot be empty.")
        
        before_state = {}
        for field in expense._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(expense, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        for key, value in data.items():
            setattr(expense, key, value)
        expense.save()
        
        # Audit log
        AuditLogService.log_update(user, expense, before_state)

        expense.refresh_from_db()
        new_mp = expense.finance_period.month_period
        invalidate_dashboard_kpi_for_month_period(old_mp)
        if new_mp.pk != old_mp.pk:
            invalidate_dashboard_kpi_for_month_period(new_mp)
        return expense
    
    @staticmethod
    def delete(expense, user):
        """Delete an actual expense."""
        assert_month_open_for_posted_facts(expense.finance_period.month_period)

        # Capture object_id BEFORE deletion
        object_id = expense.pk
        month_period = expense.finance_period.month_period
        
        before_state = {
            'id': expense.id,
            'name': expense.name,
            'amount': str(expense.amount),
            'project_id': expense.project_id,
            'prorab_plan_id': expense.prorab_plan_id,
        }
        
        expense.delete()
        
        # Audit log
        AuditLogService.log_delete(user, expense, before_state, object_id_override=object_id)

        invalidate_dashboard_kpi_for_month_period(month_period)


class ExpenseService:
    """Service for Expense business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new expense."""
        from django.core.exceptions import ValidationError
        from apps.budgeting.models import ExpenseCategory
        
        plan_period = data.get('plan_period')
        plan_item = data.get('plan_item')
        category = data.get('category')
        
        # Auto-fill category from plan_item if not provided
        if not category and plan_item:
            if hasattr(plan_item, 'category'):
                plan_item_obj = plan_item
            else:
                from ..models import PlanItem
                plan_item_obj = PlanItem.objects.select_related('category').get(id=plan_item)
            
            if plan_item_obj.category:
                category = plan_item_obj.category
                data['category'] = category
        
        if plan_period is not None:
            assert_month_open_for_planning(getattr(plan_period, 'month_period', None))
            assert_plan_editable(plan_period)

        # Validate category scope matches plan_period.fund_kind (defense-in-depth)
        if category and plan_period:
            if hasattr(category, 'id'):
                category_obj = category
            else:
                try:
                    category_obj = ExpenseCategory.objects.get(id=category)
                except ExpenseCategory.DoesNotExist:
                    raise ValidationError({'category': 'Selected category does not exist.'})
            
            if category_obj.scope != plan_period.fund_kind:
                raise ValidationError({
                    'category': f"Category scope '{category_obj.scope}' does not match plan period fund_kind '{plan_period.fund_kind}'."
                })
        
        data['created_by'] = user
        expense = Expense.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, expense)
        
        return expense
    
    @staticmethod
    def update(expense, user, **data):
        """Update an expense."""
        if expense.plan_period:
            assert_month_open_for_planning(expense.plan_period.month_period)
            assert_plan_editable(expense.plan_period)

        plan_item = data.get('plan_item')
        category = data.get('category')
        
        # If plan_item changed but category not explicitly set, use plan_item.category
        if plan_item is not None and category is None:
            if hasattr(plan_item, 'category'):
                plan_item_obj = plan_item
            else:
                from ..models import PlanItem
                plan_item_obj = PlanItem.objects.select_related('category').get(id=plan_item)
            
            if plan_item_obj.category:
                data['category'] = plan_item_obj.category
        
        before_state = {}
        for field in expense._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(expense, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value
        
        for key, value in data.items():
            setattr(expense, key, value)
        expense.save()
        
        # Audit log
        AuditLogService.log_update(user, expense, before_state)
        
        return expense
    
    @staticmethod
    def delete(expense, user):
        """Delete an expense."""
        if expense.plan_period:
            assert_month_open_for_planning(expense.plan_period.month_period)
            assert_plan_editable(expense.plan_period)

        object_id = expense.pk

        before_state = {
            'id': expense.id,
            'amount': str(expense.amount),
            'plan_period_id': expense.plan_period_id,
        }

        expense.delete()
        
        # Audit log
        AuditLogService.log_delete(user, expense, before_state, object_id_override=object_id)


class PlanningExpenseActualExpenseSyncService:
    """Service for syncing Planning Expense to Finance ActualExpense."""
    
    @staticmethod
    def resolve_finance_period(expense):
        """Resolve FinancePeriod from Expense's PlanPeriod.
        
        Args:
            expense: Expense instance with plan_period loaded
            
        Returns:
            FinancePeriod instance (created if needed)
            
        Raises:
            ValidationError: If PlanPeriod or MonthPeriod is invalid
        """
        plan_period = expense.plan_period
        if not plan_period:
            raise ValidationError("Expense must have a plan_period to sync to ActualExpense")
        
        # Extract year and month from PlanPeriod.period ("YYYY-MM")
        period_str = plan_period.period
        try:
            year_str, month_str = period_str.split('-')
            year = int(year_str)
            month = int(month_str)
        except (ValueError, AttributeError):
            raise ValidationError(f"Invalid period format: {period_str}. Expected YYYY-MM")
        
        # Resolve existing MonthPeriod; do not auto-create.
        try:
            month_period = MonthPeriod.objects.get(month=period_str)
        except MonthPeriod.DoesNotExist:
            raise ValidationError(MONTH_REQUIRED_MSG)
        
        # Resolve FinancePeriod
        # For office/charity: fund_kind + month_period (project=None)
        # For project: fund_kind + month_period + project
        fund_kind = plan_period.fund_kind
        project = plan_period.project if fund_kind == 'project' else None
        
        # Query FinancePeriod
        finance_period = FinancePeriod.objects.filter(
            month_period=month_period,
            fund_kind=fund_kind
        )
        
        # For project fund_kind, also filter by project
        if fund_kind == 'project':
            if not project:
                raise ValidationError("Project is required for fund_kind='project'")
            finance_period = finance_period.filter(project=project)
        else:
            # For office/charity, ensure project is None
            finance_period = finance_period.filter(project__isnull=True)
        
        finance_period = finance_period.first()
        
        # Create FinancePeriod if it doesn't exist
        if not finance_period:
            # Posted-facts path requires OPEN month; do not auto-create shell periods under LOCKED.
            assert_month_open_for_posted_facts(month_period)

            # Use a system user or the expense creator for FinancePeriod creation
            creator = expense.created_by if hasattr(expense, 'created_by') and expense.created_by else None

            try:
                # Derive finance period status from MonthPeriod status.
                if month_period.status == 'LOCKED':
                    finance_status = 'locked'
                else:
                    # Default to 'open' for OPEN and any legacy/unknown states.
                    finance_status = 'open'

                finance_period = FinancePeriod.objects.create(
                    month_period=month_period,
                    fund_kind=fund_kind,
                    project=project,
                    status=finance_status,
                    created_by=creator
                )
                logger.info(f"Created FinancePeriod {finance_period.id} for sync: {period_str}, {fund_kind}, project={project}")
            except IntegrityError:
                # Constraint violation - FinancePeriod already exists (race condition or constraint issue)
                # Re-query to get the existing one
                finance_period = FinancePeriod.objects.filter(
                    month_period=month_period,
                    fund_kind=fund_kind
                ).first()
                if not finance_period:
                    raise ValidationError(f"Failed to create or find FinancePeriod for {period_str}, {fund_kind}")
                logger.warning(f"FinancePeriod already exists for {period_str}, {fund_kind}, using existing {finance_period.id}")
        
        return finance_period
    
    @staticmethod
    def sync_create(expense, user):
        """Create Finance ActualExpense from Planning Expense.
        
        Args:
            expense: Expense instance (must be saved with plan_period and plan_item)
            user: User who created the expense
            
        Returns:
            ActualExpense instance or None if sync fails
        """
        try:
            # Refresh expense to ensure we have latest data and related objects loaded
            expense.refresh_from_db()
            
            # Check if already synced
            if expense.finance_actual_expense_id:
                logger.warning(f"Expense {expense.id} already has linked ActualExpense {expense.finance_actual_expense_id}, skipping create")
                return expense.finance_actual_expense
            
            # Ensure plan_period and plan_item are loaded
            if not hasattr(expense, '_plan_period_cache'):
                expense.plan_period  # Trigger load
            if not hasattr(expense, '_plan_item_cache'):
                expense.plan_item  # Trigger load
            
            # Resolve FinancePeriod
            finance_period = PlanningExpenseActualExpenseSyncService.resolve_finance_period(expense)
            
            # Get name from plan_item.title (ensure >= 2 chars)
            plan_item = expense.plan_item
            name = plan_item.title.strip() if plan_item and plan_item.title else "Expense"
            if len(name) < 2:
                name = f"Expense {expense.id}"  # Fallback
            
            # Prepare ActualExpense data
            actual_expense_data = {
                'finance_period': finance_period,
                'period': expense.plan_period,  # Link to PlanPeriod for trace
                'name': name,
                'amount': expense.amount,
                'spent_at': expense.spent_at,
                'comment': expense.comment,
            }
            # Include category only if it exists (omit key if None to enable auto-assignment)
            if expense.category is not None:
                actual_expense_data['category'] = expense.category
            
            # Create ActualExpense using service
            actual_expense = ActualExpenseService.create(user, **actual_expense_data)
            
            # Link back to Expense
            expense.finance_actual_expense = actual_expense
            expense.save(update_fields=['finance_actual_expense'])
            
            logger.info(f"Synced Expense {expense.id} → ActualExpense {actual_expense.id}")
            return actual_expense
            
        except Exception as e:
            logger.error(f"Failed to sync Expense {expense.id} to ActualExpense: {str(e)}", exc_info=True)
            return None
    
    @staticmethod
    def sync_update(expense, user):
        """Update Finance ActualExpense from Planning Expense.
        
        Args:
            expense: Expense instance (must be saved)
            user: User who updated the expense
            
        Returns:
            ActualExpense instance or None if sync fails
        """
        try:
            # Refresh expense to ensure we have latest data
            expense.refresh_from_db()
            
            # Check if synced
            if not expense.finance_actual_expense_id:
                # Not synced yet, create it
                return PlanningExpenseActualExpenseSyncService.sync_create(expense, user)
            
            actual_expense = expense.finance_actual_expense
            
            # Ensure plan_period and plan_item are loaded
            if not hasattr(expense, '_plan_period_cache'):
                expense.plan_period  # Trigger load
            if not hasattr(expense, '_plan_item_cache'):
                expense.plan_item  # Trigger load
            
            # Resolve FinancePeriod (may have changed if plan_period changed)
            finance_period = PlanningExpenseActualExpenseSyncService.resolve_finance_period(expense)
            
            # Get name from plan_item.title
            plan_item = expense.plan_item
            name = plan_item.title.strip() if plan_item and plan_item.title else "Expense"
            if len(name) < 2:
                name = f"Expense {expense.id}"
            
            # Prepare update data
            update_data = {
                'finance_period': finance_period,
                'period': expense.plan_period,
                'name': name,
                'amount': expense.amount,
                'spent_at': expense.spent_at,
                'comment': expense.comment,
            }
            # Include category only if it exists (omit key if None to enable auto-assignment)
            if expense.category is not None:
                update_data['category'] = expense.category
            
            # Update ActualExpense using service
            actual_expense = ActualExpenseService.update(actual_expense, user, **update_data)
            
            logger.info(f"Synced update Expense {expense.id} → ActualExpense {actual_expense.id}")
            return actual_expense
            
        except Exception as e:
            logger.error(f"Failed to sync update Expense {expense.id} to ActualExpense: {str(e)}", exc_info=True)
            return None
    
    @staticmethod
    def sync_delete(expense, user):
        """Delete Finance ActualExpense when Planning Expense is deleted.
        
        Args:
            expense: Expense instance (before deletion)
            user: User who deleted the expense
            
        Returns:
            True if deleted successfully, False otherwise
        """
        try:
            if not expense.finance_actual_expense_id:
                # Not synced, nothing to delete
                return True
            
            actual_expense = expense.finance_actual_expense
            
            # Delete ActualExpense using service
            ActualExpenseService.delete(actual_expense, user)
            
            logger.info(f"Synced delete Expense {expense.id} → ActualExpense {actual_expense.id} deleted")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync delete Expense {expense.id} ActualExpense: {str(e)}", exc_info=True)
            return False

