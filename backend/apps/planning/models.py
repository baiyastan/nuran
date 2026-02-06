"""
Planning models.
"""
from django.db import models
from django.conf import settings
from apps.projects.models import Project


class PlanPeriod(models.Model):
    """Plan period model - monthly plan container."""
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('locked', 'Locked'),
        ('open', 'Open'),
        ('closed', 'Closed'),
    ]
    
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        related_name='plan_periods'
    )
    period = models.CharField(
        max_length=7,
        help_text='Format: YYYY-MM (e.g., 2024-01)'
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
        unique_together = [['project', 'period']]
        indexes = [
            models.Index(fields=['project', 'period']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.project.name} - {self.period} ({self.status})"


class PlanItem(models.Model):
    """Plan item model - append-only entries."""
    
    plan_period = models.ForeignKey(
        PlanPeriod,
        on_delete=models.CASCADE,
        related_name='plan_items'
    )
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)
    qty = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=50)
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
    
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        related_name='actual_expenses',
        help_text='Project (can be Office project)'
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
            models.Index(fields=['project', 'spent_at']),
            models.Index(fields=['prorab_plan', 'spent_at']),
            models.Index(fields=['period', 'spent_at']),
        ]
    
    def __str__(self):
        return f"{self.name} - {self.amount} ({self.project.name})"

