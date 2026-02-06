"""
Planning services - business logic layer.
"""
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.db.models import Sum
from decimal import Decimal
from apps.audit.services import AuditLogService
from .models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense


class PlanPeriodService:
    """Service for PlanPeriod business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new plan period."""
        data['created_by'] = user
        plan_period = PlanPeriod.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, plan_period)
        
        return plan_period
    
    @staticmethod
    def submit(plan_period, user):
        """Submit a plan period for approval."""
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
        
        # Validate plan period is not locked
        if plan_period.status == 'locked':
            raise ValidationError("Cannot add plan items to a locked plan period")
        
        # Foreman can only create items in draft periods they created
        if user.role == 'foreman':
            if plan_period.status != 'draft':
                raise ValidationError("Foreman can only add items to draft plan periods")
            if plan_period.created_by != user:
                raise ValidationError("Foreman can only add items to their own plan periods")
        
        data['created_by'] = user
        plan_item = PlanItem.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, plan_item)
        
        return plan_item
    
    @staticmethod
    def can_modify(plan_item, user):
        """Check if user can modify a plan item."""
        # Foreman cannot modify plan items (append-only)
        if user.role == 'foreman':
            return False
        
        # Check if plan period is locked
        if plan_item.plan_period.status == 'locked':
            return False
        
        # Admin and director can modify
        return user.role in ('admin', 'director')
    
    @staticmethod
    def update(plan_item, user, **data):
        """Update a plan item."""
        if not PlanItemService.can_modify(plan_item, user):
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
        
        # Period must be OPEN
        if plan.period.status != 'open':
            return False
        
        # Plan status must be DRAFT or REJECTED
        if plan.status not in ('draft', 'rejected'):
            return False
        
        return True
    
    @staticmethod
    def submit_plan(plan, prorab):
        """Submit a plan for approval."""
        if not ProrabPlanService.can_edit(plan, prorab):
            raise ValidationError("Plan cannot be submitted. Period must be OPEN and plan must be DRAFT or REJECTED.")
        
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
    def create(user, **data):
        """Create a new actual expense."""
        # Only admin can create expenses
        if user.role not in ('admin', 'director'):
            raise ValidationError("Only admin or director can create actual expenses")
        
        # Validate comment is not empty
        comment = data.get('comment', '').strip()
        if not comment:
            raise ValidationError("Comment is required and cannot be empty.")
        
        data['created_by'] = user
        expense = ActualExpense.objects.create(**data)
        
        # Audit log
        AuditLogService.log_create(user, expense)
        
        return expense
    
    @staticmethod
    def update(expense, user, **data):
        """Update an actual expense."""
        # Only admin can update expenses
        if user.role not in ('admin', 'director'):
            raise ValidationError("Only admin or director can update actual expenses")
        
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
        
        return expense
    
    @staticmethod
    def delete(expense, user):
        """Delete an actual expense."""
        # Only admin can delete expenses
        if user.role not in ('admin', 'director'):
            raise ValidationError("Only admin or director can delete actual expenses")
        
        # Capture object_id BEFORE deletion
        object_id = expense.pk
        
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

