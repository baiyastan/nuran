"""
Planning models.
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from decimal import Decimal
from apps.projects.models import Project


class PlanPeriod(models.Model):
    """Plan period model - monthly plan container."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('locked', 'Locked'),
        ('open', 'Open'),  # Legacy alias for 'draft'
    ]
    
    FUND_KIND_CHOICES = [
        ('project', 'Project'),
        ('office', 'Office'),
        ('charity', 'Charity'),
    ]
    
    fund_kind = models.CharField(
        max_length=20,
        choices=FUND_KIND_CHOICES,
        default='office',
        help_text='Type of fund: project, office, or charity'
    )
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='plan_periods',
        null=True,
        blank=True,
        help_text='Project (required if fund_kind=project, null otherwise)'
    )
    period = models.CharField(
        max_length=7,
        help_text='Format: YYYY-MM (e.g., 2024-01)'
    )
    month_period = models.ForeignKey(
        'budgeting.MonthPeriod',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='plan_periods',
        help_text='Link to canonical MonthPeriod for this period'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True, help_text='Comments from approval/rejection')
    limit_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Monthly limit amount for this period'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_plan_periods'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-period', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'period'],
                condition=models.Q(fund_kind='project'),
                name='planning_unique_project_period'
            ),
            models.UniqueConstraint(
                fields=['fund_kind', 'period'],
                condition=models.Q(fund_kind__in=['office', 'charity']),
                name='planning_unique_office_charity_period'
            ),
        ]
        indexes = [
            models.Index(fields=['project', 'period']),
            models.Index(fields=['status']),
            models.Index(fields=['fund_kind', 'period']),
        ]
    
    def clean(self):
        """Validate fund_kind and project relationship."""
        from django.core.exceptions import ValidationError
        
        if self.fund_kind == 'project':
            if not self.project:
                raise ValidationError("Project is required when fund_kind is 'project'")
        elif self.fund_kind in ('office', 'charity'):
            if self.project:
                raise ValidationError(f"Project must be null when fund_kind is '{self.fund_kind}'")
    
    def save(self, *args, **kwargs):
        """Override save to call clean()."""
        # Normalize legacy 'open' status to 'draft'
        if self.status == 'open':
            self.status = 'draft'
        # If project is provided but fund_kind is default 'office', set to 'project'
        if self.project and self.fund_kind == 'office':
            self.fund_kind = 'project'
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        project_str = f" - {self.project.name}" if self.project else ""
        return f"{self.period} ({self.fund_kind}){project_str} - {self.status}"


class PlanItem(models.Model):
    """Plan item model - append-only entries."""
    
    plan_period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.CASCADE,
        related_name='plan_items'
    )
    title = models.CharField(max_length=255)
    category = models.ForeignKey(
        'budgeting.ExpenseCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='plan_items',
        help_text='Expense category (optional)'
    )
    qty = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    unit = models.CharField(max_length=50, null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_plan_items'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['plan_period', 'created_at']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"{self.title} - {self.plan_period}"


class ProrabPlan(models.Model):
    """Prorab plan model - foreman's plan for a specific period."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.CASCADE,
        related_name='prorab_plans'
    )
    prorab = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='prorab_plans',
        limit_choices_to={'role': 'foreman'},
        help_text='Foreman (prorab) who owns this plan'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='draft'
    )
    total_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='Total amount of all plan items'
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True, help_text='Comments from approval/rejection')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = [['period', 'prorab']]
        indexes = [
            models.Index(fields=['period', 'prorab']),
            models.Index(fields=['status']),
            models.Index(fields=['prorab', 'status']),
        ]
    
    def __str__(self):
        return f"{self.prorab.email} - {self.period} ({self.status})"


class ProrabPlanItem(models.Model):
    """Prorab plan item model - items in a prorab plan."""
    
    plan = models.ForeignKey(
        ProrabPlan,
        on_delete=models.CASCADE,
        related_name='items'
    )
    category = models.ForeignKey(
        'budgeting.ExpenseCategory',
        on_delete=models.CASCADE,
        related_name='prorab_plan_items',
        null=True,
        blank=True,
        help_text='Expense category (must be subcategory with parent != null, scope = project)'
    )
    name = models.CharField(
        max_length=255,
        help_text='Material name (e.g., бетон)'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text='Amount in KGS'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_prorab_plan_items'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['plan', 'created_at']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"{self.name} - {self.plan}"


class ActualExpense(models.Model):
    """Actual expense model - admin records spending against prorab plans."""
    
    finance_period = models.ForeignKey(
        'finance.FinancePeriod',
        on_delete=models.CASCADE,
        related_name='actual_expenses',
        help_text='Finance period (required)'
    )
    period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actual_expenses',
        help_text='Optional period link'
    )
    prorab_plan = models.ForeignKey(
        ProrabPlan,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actual_expenses',
        help_text='Optional link to prorab plan'
    )
    prorab_plan_item = models.ForeignKey(
        ProrabPlanItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actual_expenses',
        help_text='Optional link to specific prorab plan item'
    )
    category = models.ForeignKey(
        'budgeting.ExpenseCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actual_expenses',
        help_text='Expense category'
    )
    name = models.CharField(
        max_length=255,
        help_text='Expense name (e.g., бетон)'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text='Amount spent in KGS'
    )
    spent_at = models.DateField(
        help_text='Date when money was spent'
    )
    comment = models.TextField(
        blank=False,
        help_text='Required comment for every expense'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_actual_expenses',
        help_text='Admin who created this expense'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-spent_at', '-created_at']
        indexes = [
            models.Index(fields=['finance_period', 'spent_at']),
            models.Index(fields=['prorab_plan', 'spent_at']),
            models.Index(fields=['period', 'spent_at']),
        ]
    
    def clean(self):
        """Validate category if provided."""
        from django.core.exceptions import ValidationError
        from apps.expenses.base import validate_expense_category
        
        # Validate category if provided (category is nullable)
        if self.category:
            try:
                # No plan scope validation for ActualExpense (it's project-based)
                validate_expense_category(self.category, plan_scope=None)
            except ValidationError as e:
                # Merge validation errors
                errors = {}
                if hasattr(e, 'error_dict'):
                    errors.update(e.error_dict)
                elif hasattr(e, 'message_dict'):
                    errors.update(e.message_dict)
                else:
                    if isinstance(e.messages, list):
                        errors['category'] = e.messages
                    else:
                        errors['category'] = [str(e)]
                
                if errors:
                    raise ValidationError(errors)
    
    def __str__(self):
        project_name = self.finance_period.project.name if self.finance_period and self.finance_period.project else "-"
        return f"{self.name} - {self.amount} ({project_name})"


class Expense(models.Model):
    """Expense model - expenses linked to plan periods."""
    
    plan_period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.CASCADE,
        related_name='expenses',
        help_text='Plan period this expense belongs to'
    )
    plan_item = models.ForeignKey(
        PlanItem,
        on_delete=models.CASCADE,
        related_name='expenses',
        null=False,
        blank=False,
        help_text='Plan item this expense is linked to'
    )
    spent_at = models.DateField(
        help_text='Date when expense was incurred'
    )
    category = models.ForeignKey(
        'budgeting.ExpenseCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expenses',
        help_text='Expense category (optional)'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
        help_text='Amount in KGS'
    )
    comment = models.TextField(
        blank=False,
        help_text='Comment is required'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_expenses',
        help_text='User who created this expense'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    finance_actual_expense = models.OneToOneField(
        ActualExpense,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='planning_expense',
        help_text='Linked Finance ActualExpense (synced automatically)'
    )
    
    class Meta:
        ordering = ['-spent_at', '-created_at']
        indexes = [
            models.Index(fields=['plan_period', 'spent_at']),
            models.Index(fields=['plan_item', 'spent_at']),
            models.Index(fields=['spent_at']),
            models.Index(fields=['category']),
        ]
    
    def __str__(self):
        return f"Expense - {self.amount} ({self.spent_at})"

