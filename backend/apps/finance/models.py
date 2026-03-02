"""
Finance models.
"""
from django.db import models
from django.core.exceptions import ValidationError
from django.conf import settings


class FinancePeriod(models.Model):
    """Finance period model - manages financial periods by fund_kind (project/office/charity)."""
    
    FUND_KIND_CHOICES = [
        ('project', 'Project'),
        ('office', 'Office'),
        ('charity', 'Charity'),
    ]
    
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('locked', 'Locked'),
        ('closed', 'Closed'),
    ]
    
    month_period = models.ForeignKey(
        'budgeting.MonthPeriod',
        on_delete=models.CASCADE,
        related_name='finance_periods',
        help_text='Month period for this finance period'
    )
    fund_kind = models.CharField(
        max_length=20,
        choices=FUND_KIND_CHOICES,
        help_text='Type of fund: project, office, or charity'
    )
    project = models.ForeignKey(
        'projects.Project',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='finance_periods',
        help_text='Project (required if fund_kind=project, null otherwise)'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='open',
        help_text='Status of the finance period'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_finance_periods',
        help_text='User who created this finance period'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-month_period__month', '-created_at']
        indexes = [
            models.Index(fields=['month_period', 'fund_kind']),
            models.Index(fields=['fund_kind', 'status']),
            models.Index(fields=['project', 'month_period']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['month_period', 'fund_kind'],
                name='unique_finance_period_month_fund_kind'
            ),
        ]
    
    def clean(self):
        """Validate fund_kind and project relationship."""
        if self.fund_kind == 'project':
            if not self.project:
                raise ValidationError("Project is required when fund_kind is 'project'")
        elif self.fund_kind in ('office', 'charity'):
            if self.project:
                raise ValidationError(f"Project must be null when fund_kind is '{self.fund_kind}'")
    
    def save(self, *args, **kwargs):
        """Override save to call clean()."""
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        project_str = f" - {self.project.name}" if self.project else ""
        return f"{self.month_period.month} - {self.get_fund_kind_display()}{project_str}"


class IncomeSource(models.Model):
    """Income source model - categorizes income sources."""
    
    name = models.CharField(
        max_length=255,
        unique=True,
        help_text='Name of the income source'
    )
    is_active = models.BooleanField(
        default=True,
        help_text='Whether this income source is active'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return self.name


class IncomePlan(models.Model):
    """Income plan model - planned income for a finance period."""
    
    period = models.ForeignKey(
        FinancePeriod,
        on_delete=models.CASCADE,
        related_name='income_plans',
        help_text='Finance period for this income plan'
    )
    source = models.ForeignKey(
        IncomeSource,
        on_delete=models.CASCADE,
        related_name='income_plans',
        help_text='Income source for this plan'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text='Planned income amount'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['period', 'source'],
                name='unique_income_plan_period_source'
            ),
        ]
        indexes = [
            models.Index(fields=['period']),
            models.Index(fields=['source']),
        ]
    
    def __str__(self):
        return f"{self.period} - {self.source.name}: {self.amount}"


class IncomeEntry(models.Model):
    """Income entry model - tracks incoming money linked to finance periods."""
    
    finance_period = models.ForeignKey(
        FinancePeriod,
        on_delete=models.CASCADE,
        related_name='income_entries',
        help_text='Finance period for this income entry'
    )
    source = models.ForeignKey(
        IncomeSource,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='income_entries',
        help_text='Income source for this entry'
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text='Income amount'
    )
    received_at = models.DateField(
        help_text='Date when money was received'
    )
    comment = models.TextField(
        help_text='Required comment for this income entry'
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_income_entries',
        help_text='User who created this income entry'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-received_at', '-created_at']
        indexes = [
            models.Index(fields=['finance_period', 'received_at']),
            models.Index(fields=['received_at']),
            models.Index(fields=['source']),
        ]
    
    def clean(self):
        """Validate income entry."""
        # Comment is required and cannot be empty
        if not self.comment or not self.comment.strip():
            raise ValidationError("Comment is required and cannot be empty.")
        
        # Amount must be positive
        if self.amount <= 0:
            raise ValidationError("Amount must be greater than zero.")
    
    def save(self, *args, **kwargs):
        """Override save to call clean()."""
        self.full_clean()
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.finance_period} - {self.amount} on {self.received_at}"

