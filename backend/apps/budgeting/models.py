"""
Budgeting models.
"""
from django.db import models
from django.db.models import Q
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
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
    
    def __str__(self):
        return self.name
    
    def is_leaf(self):
        """Check if category is a leaf (has no children)."""
        return not self.children.exists()
    
    def clean(self):
        """Validate scope and kind inheritance from parent."""
        from django.core.exceptions import ValidationError
        
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


class BudgetPlan(models.Model):
    """Budget plan model."""
    
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
    root_category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        null=False,
        blank=False,
        related_name='root_budget_plans',
        help_text='Root category (must have parent=None)'
    )
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        help_text='OFFICE or PROJECT (must match root_category.scope)'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='budget_plans',
        help_text='Required when scope=PROJECT'
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
        # Unique constraint: one plan per project per month for PROJECT scope
        # For OFFICE/CHARITY scopes: one plan per period (per scope)
        constraints = [
            models.UniqueConstraint(
                fields=['period', 'project'],
                condition=Q(scope='PROJECT'),
                name='unique_project_period'
            ),
            models.UniqueConstraint(
                fields=['period', 'scope'],
                condition=Q(scope__in=['OFFICE', 'CHARITY']),
                name='unique_office_charity_period'
            ),
        ]
        indexes = [
            models.Index(fields=['period', 'scope', 'project']),
            models.Index(fields=['status']),
            models.Index(fields=['period', 'root_category', 'project']),
        ]
    
    def __str__(self):
        project_name = self.project.name if self.project else 'Office'
        return f"{self.period.month} - {self.scope} - {project_name} ({self.status})"
    
    def clean(self):
        """Validate root_category, scope, and project consistency."""
        from django.core.exceptions import ValidationError
        errors = {}
        
        # Validate root_category is a root (parent must be NULL)
        if self.root_category and self.root_category.parent is not None:
            errors['root_category'] = 'Root category must have parent=None (must be a root category)'
        
        # Map root_category.scope to BudgetPlan.scope
        scope_mapping = {
            'office': 'OFFICE',
            'project': 'PROJECT',
            'charity': 'CHARITY'
        }
        expected_scope = scope_mapping.get(self.root_category.scope if self.root_category else None)
        
        # Validate scope matches root_category.scope
        if self.root_category and expected_scope and self.scope != expected_scope:
            errors['scope'] = f'Scope must be {expected_scope} to match root_category.scope={self.root_category.scope}'
        
        # Validate project based on root_category.scope
        if self.root_category:
            if self.root_category.scope in ('office', 'charity') and self.project is not None:
                errors['project'] = f'Project must be NULL when root_category.scope is "{self.root_category.scope}"'
            elif self.root_category.scope == 'project' and self.project is None:
                errors['project'] = 'Project is required when root_category.scope is "project"'
        
        # Legacy validation: project required when scope=PROJECT (for backward compatibility)
        if self.scope == 'PROJECT' and not self.project:
            errors['project'] = 'Project is required when scope is PROJECT'
        
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
        errors = {}
        
        # Validate category is leaf
        if self.category and not self.category.is_leaf():
            errors['category'] = 'Category must be a leaf category (no children).'
        
        # Validate category is active
        if self.category and not self.category.is_active:
            errors['category'] = 'Category must be active.'
        
        # Validate category kind is EXPENSE
        if self.category and self.category.kind != 'EXPENSE':
            errors['category'] = f'Category kind must be EXPENSE. Current kind: {self.category.kind}'
        
        # Validate category scope matches plan scope
        if self.category and self.plan:
            scope_mapping = {
                'office': 'OFFICE',
                'project': 'PROJECT',
                'charity': 'CHARITY'
            }
            expected_scope = scope_mapping.get(self.category.scope)
            if expected_scope and self.plan.scope != expected_scope:
                errors['category'] = f'Category scope "{self.category.scope}" does not match plan scope "{self.plan.scope}".'
        
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

