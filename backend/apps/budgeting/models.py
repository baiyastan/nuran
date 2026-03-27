"""
Budgeting models.
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
from django.db.models import Q
from django.db.models.functions import Lower, Trim
from apps.projects.models import Project


class ExpenseCategory(models.Model):
    """Expense category model with tree structure."""
    
    SCOPE_CHOICES = [
        ('project', 'Project'),
        ('office', 'Office'),
        ('charity', 'Charity'),
    ]
    
    KIND_CHOICES = [
        ('EXPENSE', 'Expense'),
        ('INCOME', 'Income'),
    ]
    
    name = models.CharField(max_length=255)
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        default='project',
        help_text='Scope: project, office, or charity'
    )
    kind = models.CharField(
        max_length=20,
        choices=KIND_CHOICES,
        default='EXPENSE',
        help_text='Kind: EXPENSE or INCOME'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text='Parent category for tree structure'
    )
    is_active = models.BooleanField(default=True)
    is_system_root = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name_plural = 'Expense Categories'
        ordering = ['name']
        indexes = [
            models.Index(fields=['scope', 'is_active']),
            models.Index(fields=['kind', 'is_active']),
            models.Index(fields=['parent']),
        ]
        constraints = [
            # Safety net: at most one active root per scope.
            models.UniqueConstraint(
                fields=['scope'],
                condition=Q(parent__isnull=True, is_active=True),
                name='uniq_active_root_per_scope',
            ),
            # Child names must be unique per parent after trim/lower normalization.
            models.UniqueConstraint(
                'parent',
                'scope',
                Lower(Trim('name')),
                condition=Q(parent__isnull=False),
                name='uniq_child_name_per_parent_norm',
            ),
        ]
    
    def __str__(self):
        return self.name
    
    def is_leaf(self):
        """Check if category is a leaf (has no children)."""
        return not self.children.exists()
    
    def clean(self):
        """Validate scope and kind inheritance from parent."""
        from django.core.exceptions import ValidationError
        from django.db.models.functions import Lower, Trim

        normalized_name = (self.name or '').strip()
        if normalized_name != (self.name or ''):
            self.name = normalized_name
        if not normalized_name:
            raise ValidationError({'name': 'Name is required.'})
        
        if self.parent is not None:
            errors = {}
            # Child must inherit parent's scope
            if self.scope != self.parent.scope:
                errors['scope'] = f'Child category scope must match parent scope. Parent "{self.parent.name}" has scope="{self.parent.scope}", but child has scope="{self.scope}".'
            
            # Child must inherit parent's kind
            if self.kind != self.parent.kind:
                errors['kind'] = f'Child category kind must match parent kind. Parent "{self.parent.name}" has kind="{self.parent.kind}", but child has kind="{self.kind}".'
            
            if errors:
                raise ValidationError(errors)
        elif self.is_system_root is False:
            # Non-system roots are legacy data and should not be created by API path.
            # Serializer/view enforces business rule for user-facing operations.
            pass

        if self.parent is None and self.is_active:
            active_root_qs = ExpenseCategory.objects.filter(
                scope=self.scope,
                parent__isnull=True,
                is_active=True,
            )
            if self.pk:
                active_root_qs = active_root_qs.exclude(pk=self.pk)
            if active_root_qs.exists():
                raise ValidationError({'scope': 'Only one active root is allowed per scope.'})

        # Guard against sibling duplicates before DB constraint kicks in.
        sibling_qs = ExpenseCategory.objects.filter(
            scope=self.scope,
            parent=self.parent,
        ).annotate(
            normalized_name=Lower(Trim('name'))
        ).filter(normalized_name=normalized_name.lower())
        if self.pk:
            sibling_qs = sibling_qs.exclude(pk=self.pk)
        if sibling_qs.exists():
            raise ValidationError(
                {'name': 'Category with this name already exists under the same parent.'}
            )


class MonthPeriod(models.Model):
    """Month period model for budgeting."""
    
    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('LOCKED', 'Locked'),
    ]
    
    month = models.CharField(
        max_length=7,
        unique=True,
        help_text='Format: YYYY-MM (e.g., 2024-01)'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='OPEN'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-month']
        indexes = [
            models.Index(fields=['month', 'status']),
        ]
    
    def __str__(self):
        return self.month

    def clean(self):
        import re
        from django.core.exceptions import ValidationError
        errors = {}
        if self.month and not re.match(r'^\d{4}-\d{2}$', self.month.strip()):
            errors['month'] = 'Month must be YYYY-MM (e.g. 2024-01).'
        if self.status not in ('OPEN', 'LOCKED'):
            errors['status'] = 'Status must be OPEN or LOCKED.'
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class BudgetPlan(models.Model):
    """Budget plan model - one per (period, scope).
    
    Identity note:
    - BudgetPlan is uniquely identified by (period, scope) for all scopes.
    - The project field is legacy/optional metadata and MUST remain NULL;
      it is not part of the uniqueness key.
    - See Meta.constraints.unique_period_scope and API create logic in
      apps.budgeting.api.views.BudgetPlanViewSet.create.
    """

    SCOPE_CHOICES = [
        ('OFFICE', 'Office'),
        ('PROJECT', 'Project'),
        ('CHARITY', 'Charity'),
    ]

    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('OPEN', 'Open'),
        ('SUBMITTED', 'Submitted'),
        ('APPROVED', 'Approved'),
        ('CLOSED', 'Closed'),
    ]

    period = models.ForeignKey(
        MonthPeriod,
        on_delete=models.CASCADE,
        related_name='budget_plans'
    )
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        help_text='OFFICE, PROJECT, or CHARITY'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='budget_plans',
        help_text='Optional; not used for plan key (all scopes keyed by period + scope only)'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='DRAFT'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_budget_plans'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-period__month', '-created_at']
        # One plan per (period, scope) for all scopes; project is not part of the key
        constraints = [
            models.UniqueConstraint(
                fields=['period', 'scope'],
                name='unique_period_scope'
            ),
        ]
        indexes = [
            models.Index(fields=['period', 'scope', 'project']),
            models.Index(fields=['status']),
        ]

    def __str__(self):
        return f"{self.period.month} - {self.scope} ({self.status})"

    def clean(self):
        """Validate project is always null (not part of identity)."""
        from django.core.exceptions import ValidationError
        errors = {}
        # BudgetPlan is uniquely identified by (period, scope) for all scopes.
        # Project is a legacy/optional field and must remain NULL.
        if self.project is not None:
            errors['project'] = f'Project must be NULL when scope is {self.scope}'
        if errors:
            raise ValidationError(errors)


class BudgetLine(models.Model):
    """Budget line model - line items in a budget plan."""
    
    plan = models.ForeignKey(
        BudgetPlan,
        on_delete=models.CASCADE,
        related_name='lines'
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.CASCADE,
        related_name='budget_lines',
        help_text='Must be a leaf category'
    )
    amount_planned = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Planned amount'
    )
    note = models.TextField(blank=True, help_text='Optional note')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['plan', 'category']]
        ordering = ['category__name']
        indexes = [
            models.Index(fields=['plan', 'category']),
        ]
    
    def __str__(self):
        return f"{self.plan} - {self.category.name}: {self.amount_planned}"


class BudgetPlanSummaryComment(models.Model):
    """Summary comment for a budget plan."""
    
    plan = models.OneToOneField(
        BudgetPlan,
        on_delete=models.CASCADE,
        related_name='summary_comment'
    )
    comment_text = models.TextField(blank=False, help_text='Summary comment for the budget plan')
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_budget_summary_comments'
    )
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-updated_at']
    
    def __str__(self):
        return f"Summary comment for {self.plan}"


class BudgetExpense(models.Model):
    """Budget expense model - actual expenses against a budget plan."""
    
    plan = models.ForeignKey(
        BudgetPlan,
        on_delete=models.CASCADE,
        related_name='expenses',
        help_text='Budget plan this expense belongs to'
    )
    category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name='budget_expenses',
        help_text='Expense category (must be leaf and active)'
    )
    amount_spent = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text='Amount spent'
    )
    comment = models.TextField(blank=True, help_text='Optional comment')
    spent_at = models.DateField(
        default=timezone.localdate,
        help_text='Date when expense was incurred'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_budget_expenses'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-spent_at', '-created_at']
        indexes = [
            models.Index(fields=['plan', 'category']),
            models.Index(fields=['spent_at']),
            models.Index(fields=['plan', 'spent_at']),
        ]
    
    def __str__(self):
        return f"{self.plan} - {self.category.name}: {self.amount_spent} ({self.spent_at})"
    
    def clean(self):
        """Validate category and plan status."""
        from django.core.exceptions import ValidationError
        from apps.expenses.base import validate_expense_category
        
        errors = {}
        
        # Use shared category validation
        if self.category:
            try:
                plan_scope = self.plan.scope if self.plan else None
                validate_expense_category(self.category, plan_scope)
            except ValidationError as e:
                # Merge validation errors
                if hasattr(e, 'error_dict'):
                    errors.update(e.error_dict)
                elif hasattr(e, 'message_dict'):
                    errors.update(e.message_dict)
                else:
                    # Single message or list of messages
                    if isinstance(e.messages, list):
                        errors['category'] = e.messages
                    else:
                        errors['category'] = [str(e)]
        
        # Validate plan status is APPROVED (for write operations)
        # Note: This will be checked in serializer for API operations
        # But we also validate at model level for admin/other direct saves
        if self.plan and self.plan.status != 'APPROVED':
            # Only raise error if this is a new expense or being modified
            # We check pk to see if this is an existing instance
            if not self.pk:  # New expense
                errors['plan'] = f'Cannot create expense. Plan status must be APPROVED. Current status: {self.plan.status}'
        
        if errors:
            raise ValidationError(errors)

