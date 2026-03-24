"""
Finance services - business logic layer.
"""
from datetime import date
from decimal import Decimal
from django.db import IntegrityError, transaction
from django.db.models import Sum, Count, Q, Value, DecimalField
from django.db.models.functions import Coalesce
from rest_framework.exceptions import PermissionDenied, ValidationError
from apps.audit.services import AuditLogService
from .models import FinancePeriod, IncomeEntry, IncomePlan, IncomeSource
from .constants import MONTH_LOCKED_MSG, MONTH_REQUIRED_MSG, ADMIN_ONLY_MSG


def assert_month_open(month_period):
    """Assert that month period is open, raise PermissionDenied if locked or missing."""
    if not month_period or month_period.status != 'OPEN':
        raise PermissionDenied(MONTH_LOCKED_MSG)


def assert_month_open_or_admin(user, month_period):
    """Assert that month period is open OR user is admin.
    
    Args:
        user: User instance
        month_period: MonthPeriod instance or None
        
    Raises:
        PermissionDenied: If month is locked and user is not admin
    """
    if not month_period:
        raise PermissionDenied(MONTH_LOCKED_MSG)
    
    if month_period.status == 'OPEN':
        return
    
    if month_period.status == 'LOCKED' and getattr(user, "role", None) == 'admin':
        return
    
    raise PermissionDenied(MONTH_LOCKED_MSG)


def assert_month_open_for_plans(month_period):
    """Assert that MonthPeriod exists and is OPEN for plan-side writes.
    
    This applies to all users equally (no admin bypass).
    """
    if not month_period:
        raise PermissionDenied(MONTH_REQUIRED_MSG)
    if month_period.status != 'OPEN':
        raise PermissionDenied(MONTH_LOCKED_MSG)


def assert_month_exists_for_facts(month_period):
    """Assert that MonthPeriod exists for fact-side writes (OPEN or LOCKED allowed)."""
    if not month_period:
        raise PermissionDenied(MONTH_REQUIRED_MSG)


class FinancePeriodService:
    """Service for FinancePeriod business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new finance period."""
        # Check month period is open
        month_period = data.get('month_period')
        assert_month_open(month_period)

        data['created_by'] = user
        with transaction.atomic():
            finance_period = FinancePeriod.objects.create(**data)
            AuditLogService.log_create(user, finance_period)

        return finance_period
    
    @staticmethod
    def update(finance_period, user, **data):
        """Update a finance period."""
        # Check month period is open (from validated_data or existing instance)
        month_period = data.get('month_period', finance_period.month_period)
        assert_month_open(month_period)

        before_state = {}
        for field in finance_period._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(finance_period, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value

        with transaction.atomic():
            for key, value in data.items():
                setattr(finance_period, key, value)
            finance_period.save()
            AuditLogService.log_update(user, finance_period, before_state)

        return finance_period
    
    @staticmethod
    def delete(finance_period, user):
        """Delete a finance period."""
        # Check month period is open
        assert_month_open(finance_period.month_period)

        # Capture object_id BEFORE deletion
        object_id = finance_period.pk

        before_state = {
            'id': finance_period.id,
            'month_period_id': finance_period.month_period_id,
            'fund_kind': finance_period.fund_kind,
            'project_id': finance_period.project_id if finance_period.project else None,
        }

        with transaction.atomic():
            finance_period.delete()
            AuditLogService.log_delete(user, finance_period, before_state, object_id_override=object_id)
    
    @staticmethod
    def sync_status_from_month_period(month_period):
        """Sync FinancePeriod status from MonthPeriod status.

        When MonthPeriod status changes, update all related FinancePeriod.status values:
        - MonthPeriod.OPEN → FinancePeriod.status = 'open'
        - MonthPeriod.LOCKED → FinancePeriod.status = 'locked'

        Uses uppercase MonthPeriod status consistently (e.g. 'open' → 'OPEN' before lookup).
        """
        status_map = {
            'OPEN': 'open',
            'LOCKED': 'locked',
        }
        raw = getattr(month_period, 'status', None) or ''
        status_upper = raw.upper() if isinstance(raw, str) else str(raw).upper()
        target_status = status_map.get(status_upper)
        if not target_status:
            return
        finance_periods = list(FinancePeriod.objects.filter(month_period=month_period))
        to_update = [fp for fp in finance_periods if fp.status != target_status]
        for fp in to_update:
            fp.status = target_status
        if to_update:
            FinancePeriod.objects.bulk_update(to_update, ['status'])


class IncomeEntryService:
    """Service for IncomeEntry business logic."""
    
    @staticmethod
    def create(user, **data):
        """Create a new income entry."""
        # Validate comment is not empty
        comment = data.get('comment', '').strip()
        if not comment:
            raise ValidationError("Comment is required and cannot be empty.")
        
        # Validate amount > 0
        amount = data.get('amount')
        if amount is not None and amount <= 0:
            raise ValidationError("Amount must be greater than zero.")
        
        # Validate finance_period is provided
        finance_period = data.get('finance_period')
        if not finance_period:
            raise ValidationError("Finance period is required")
        
        # Check that related MonthPeriod exists (OPEN or LOCKED allowed for facts)
        assert_month_exists_for_facts(finance_period.month_period)

        data['created_by'] = user
        with transaction.atomic():
            income_entry = IncomeEntry.objects.create(**data)
            AuditLogService.log_create(user, income_entry)

        return income_entry
    
    @staticmethod
    def update(income_entry, user, **data):
        """Update an income entry."""
        # Validate comment is not empty if provided
        if 'comment' in data:
            comment = data['comment'].strip() if data['comment'] else ''
            if not comment:
                raise ValidationError("Comment is required and cannot be empty.")
        
        # Validate amount > 0 if provided
        if 'amount' in data:
            amount = data['amount']
            if amount <= 0:
                raise ValidationError("Amount must be greater than zero.")
        
        # Check that related MonthPeriod exists (from validated_data or existing instance)
        finance_period = data.get('finance_period', income_entry.finance_period)
        assert_month_exists_for_facts(finance_period.month_period)

        before_state = {}
        for field in income_entry._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(income_entry, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value

        with transaction.atomic():
            for key, value in data.items():
                setattr(income_entry, key, value)
            income_entry.save()
            AuditLogService.log_update(user, income_entry, before_state)

        return income_entry
    
    @staticmethod
    def delete(income_entry, user):
        """Delete an income entry."""
        # Check that related MonthPeriod exists
        assert_month_exists_for_facts(income_entry.finance_period.month_period)

        # Capture object_id BEFORE deletion
        object_id = income_entry.pk

        before_state = {
            'id': income_entry.id,
            'finance_period_id': income_entry.finance_period_id,
            'amount': str(income_entry.amount),
            'received_at': str(income_entry.received_at),
        }

        with transaction.atomic():
            income_entry.delete()
            AuditLogService.log_delete(user, income_entry, before_state, object_id_override=object_id)


class IncomePlanService:
    """Service for IncomePlan business logic."""

    @staticmethod
    def _raise_duplicate_plan_validation_error(exc: IntegrityError):
        """Map unique period+source collisions to a clean API validation error."""
        error_text = str(exc)
        if 'unique_income_plan_period_source' in error_text or (
            'finance_incomeplan.period_id' in error_text and 'finance_incomeplan.source_id' in error_text
        ):
            raise ValidationError({
                'source_id': 'A plan for this source already exists in the selected month. Please edit the existing plan.'
            })
        raise exc
    
    @staticmethod
    def serialize_finance_period(period):
        """Serialize FinancePeriod to period info dict.
        
        Args:
            period: FinancePeriod instance or None
        
        Returns:
            None if period is None, else dict with year, month, status
        """
        if not period or not period.month_period:
            return None
        
        month_value = period.month_period.month
        
        if not month_value:
            return None
        
        # Handle different formats: date object, "YYYY-MM-DD", or "YYYY-MM" (CharField)
        if isinstance(month_value, date):
            year_val = month_value.year
            month_val = month_value.month
        elif isinstance(month_value, str):
            # Handle "YYYY-MM" format (CharField, length == 7)
            if len(month_value) == 7:
                try:
                    parts = month_value.split('-')
                    if len(parts) == 2:
                        year_val = int(parts[0])
                        month_val = int(parts[1])
                    else:
                        return None
                except (ValueError, IndexError):
                    return None
            else:
                # Try parsing as "YYYY-MM-DD" format
                try:
                    parsed_date = date.fromisoformat(month_value)
                    year_val = parsed_date.year
                    month_val = parsed_date.month
                except ValueError:
                    return None
        else:
            return None
        
        return {
            'year': year_val,
            'month': month_val,
            'status': period.status
        }
    
    @staticmethod
    def resolve_finance_period(year, month, fund_kind='office', raise_error=True):
        """Resolve FinancePeriod from year, month, and fund_kind.
        
        Args:
            year: Year (int)
            month: Month (int, 1-12)
            fund_kind: Fund kind ('office', 'project', or 'charity'), defaults to 'office'
            raise_error: If True, raise ValidationError when not found. If False, return None.
        
        Returns:
            FinancePeriod instance or None if not found and raise_error=False
        
        Raises:
            ValidationError: If raise_error=True and MonthPeriod or FinancePeriod not found
        """
        if not year or not month:
            return None
        
        # Format as "YYYY-MM" string (MonthPeriod.month is CharField)
        month_str = f"{int(year):04d}-{int(month):02d}"  # e.g., "2026-02"
        
        # Find MonthPeriod by month (CharField lookup)
        from apps.budgeting.models import MonthPeriod
        try:
            mp = MonthPeriod.objects.get(month=month_str)
        except MonthPeriod.DoesNotExist:
            if raise_error:
                raise ValidationError({
                    'non_field_errors': [f'Month period {month_str} does not exist. Please create it first.']
                })
            return None
        except Exception as e:
            # Catch any other exceptions and wrap in ValidationError
            if raise_error:
                raise ValidationError({
                    'non_field_errors': [f'Error resolving month period {month_str}: {str(e)}']
                })
            return None
        
        # Find FinancePeriod by month_period AND fund_kind (with month_period loaded for serialization)
        try:
            fp = FinancePeriod.objects.select_related('month_period').get(
                month_period=mp,
                fund_kind=fund_kind
            )
        except FinancePeriod.DoesNotExist:
            if raise_error:
                raise ValidationError({
                    'non_field_errors': [f'Finance period for {month_str} with fund_kind={fund_kind} does not exist. Please create it first.']
                })
            return None
        except Exception as e:
            # Catch any other exceptions and wrap in ValidationError
            if raise_error:
                raise ValidationError({
                    'non_field_errors': [f'Error resolving finance period for {month_str}: {str(e)}']
                })
            return None
        
        return fp
    
    @staticmethod
    def assert_period_open(income_plan):
        """Assert that the period for income plan is open."""
        if not income_plan.period:
            raise PermissionDenied("Period is not available.")
        
        # Check FinancePeriod.status
        if income_plan.period.status != 'open':
            raise PermissionDenied("Period is closed. Cannot modify income plans for closed periods.")
        
        # Check MonthPeriod.status - ensure month period is OPEN
        month_period = income_plan.period.month_period
        if not month_period or month_period.status != 'OPEN':
            raise PermissionDenied("Month is locked. Cannot modify income plans for locked months.")
    
    @staticmethod
    def create(user, **data):
        """Create a new income plan."""
        # Fail-safe: remove year/month if present (not model fields)
        data.pop('year', None)
        data.pop('month', None)
        
        # Validate amount > 0
        amount = data.get('amount')
        if amount is not None and amount <= 0:
            raise ValidationError("Amount must be greater than zero.")
        
        # Create instance to check period
        income_plan = IncomePlan(**data)
        IncomePlanService.assert_period_open(income_plan)

        try:
            with transaction.atomic():
                income_plan.save()
                AuditLogService.log_create(user, income_plan)
        except IntegrityError as exc:
            IncomePlanService._raise_duplicate_plan_validation_error(exc)

        return income_plan
    
    @staticmethod
    def update(income_plan, user, **data):
        """Update an income plan."""
        # Fail-safe: remove year/month if present (not model fields)
        data.pop('year', None)
        data.pop('month', None)
        
        # Validate amount > 0 if provided
        if 'amount' in data:
            amount = data['amount']
            if amount <= 0:
                raise ValidationError("Amount must be greater than zero.")
        
        # Check period is open
        IncomePlanService.assert_period_open(income_plan)

        before_state = {}
        for field in income_plan._meta.fields:
            if field.name not in ['id', 'created_at', 'updated_at']:
                value = getattr(income_plan, field.name, None)
                if value is not None:
                    if hasattr(value, 'pk'):
                        before_state[field.name] = value.pk
                    else:
                        before_state[field.name] = value

        for key, value in data.items():
            setattr(income_plan, key, value)

        # Check period is still open after update (in case period changed)
        IncomePlanService.assert_period_open(income_plan)

        try:
            with transaction.atomic():
                income_plan.save()
                AuditLogService.log_update(user, income_plan, before_state)
        except IntegrityError as exc:
            IncomePlanService._raise_duplicate_plan_validation_error(exc)

        return income_plan
    
    @staticmethod
    def delete(income_plan, user):
        """Delete an income plan."""
        # Check period is open
        IncomePlanService.assert_period_open(income_plan)

        # Capture object_id BEFORE deletion
        object_id = income_plan.pk

        before_state = {
            'id': income_plan.id,
            'period_id': income_plan.period_id,
            'source_id': income_plan.source_id,
            'amount': str(income_plan.amount),
        }

        with transaction.atomic():
            income_plan.delete()
            AuditLogService.log_delete(user, income_plan, before_state, object_id_override=object_id)


class IncomeSummaryService:
    """Service for income summary aggregation."""
    
    @staticmethod
    def build_for_finance_period(finance_period):
        """Build income summary breakdown by source for a finance period.
        
        Args:
            finance_period: FinancePeriod instance
            
        Returns:
            dict with structure:
            {
                'rows': [
                    {
                        'source_id': int,
                        'source_name': str,
                        'planned': Decimal (as string),
                        'actual': Decimal (as string),
                        'diff': Decimal (as string),
                        'plans_count': int,
                        'entries_count': int
                    }
                ],
                'planned_total': Decimal (as string),
                'actual_total': Decimal (as string),
                'diff_total': Decimal (as string)
            }
        """
        # Get all unique source IDs from plans and entries (union)
        plan_source_ids = IncomePlan.objects.filter(
            period=finance_period
        ).values_list('source_id', flat=True).distinct()
        
        entry_source_ids = IncomeEntry.objects.filter(
            finance_period=finance_period,
            source__isnull=False
        ).values_list('source_id', flat=True).distinct()
        
        all_source_ids = set(plan_source_ids) | set(entry_source_ids)
        
        # Get source objects for all IDs
        sources = IncomeSource.objects.filter(id__in=all_source_ids)
        
        # Aggregate planned amounts by source
        planned_aggregates = IncomePlan.objects.filter(
            period=finance_period
        ).values('source_id').annotate(
            planned_sum=Coalesce(
                Sum('amount'),
                Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
            ),
            plans_count=Count('id')
        )
        planned_by_source = {
            item['source_id']: {
                'planned': item['planned_sum'],
                'plans_count': item['plans_count']
            }
            for item in planned_aggregates
        }
        
        # Aggregate actual amounts by source (excluding null sources)
        actual_aggregates = IncomeEntry.objects.filter(
            finance_period=finance_period,
            source__isnull=False
        ).values('source_id').annotate(
            actual_sum=Coalesce(
                Sum('amount'),
                Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))
            ),
            entries_count=Count('id')
        )
        actual_by_source = {
            item['source_id']: {
                'actual': item['actual_sum'],
                'entries_count': item['entries_count']
            }
            for item in actual_aggregates
        }
        
        # Build rows and calculate totals
        rows = []
        planned_total = Decimal('0.00')
        actual_total = Decimal('0.00')
        
        for source in sources.order_by('name'):
            source_id = source.id
            planned_data = planned_by_source.get(source_id, {'planned': Decimal('0.00'), 'plans_count': 0})
            actual_data = actual_by_source.get(source_id, {'actual': Decimal('0.00'), 'entries_count': 0})
            
            planned = planned_data['planned']
            actual = actual_data['actual']
            diff = actual - planned
            
            # Accumulate totals
            planned_total += planned
            actual_total += actual
            
            rows.append({
                'source_id': source_id,
                'source_name': source.name,
                'planned': str(planned.quantize(Decimal('0.01'))),
                'actual': str(actual.quantize(Decimal('0.01'))),
                'diff': str(diff.quantize(Decimal('0.01'))),
                'plans_count': planned_data['plans_count'],
                'entries_count': actual_data['entries_count']
            })
        
        # Calculate diff total
        diff_total = actual_total - planned_total
        
        return {
            'rows': rows,
            'planned_total': str(planned_total.quantize(Decimal('0.01'))),
            'actual_total': str(actual_total.quantize(Decimal('0.01'))),
            'diff_total': str(diff_total.quantize(Decimal('0.01')))
        }
