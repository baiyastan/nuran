"""
Expenses models - actual expense records decoupled from plan_item/plan_period.
Keyed by (month_period, scope) — no FinancePeriod dependency.
"""
from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from decimal import Decimal

from apps.finance.models import ACCOUNT_CHOICES, CURRENCY_CHOICES


class ActualExpense(models.Model):
    """Actual expense - real spending keyed by month and scope (OFFICE/PROJECT/CHARITY)."""

    SCOPE_CHOICES = [
        ('OFFICE', 'Office'),
        ('PROJECT', 'Project'),
        ('CHARITY', 'Charity'),
    ]

    month_period = models.ForeignKey(
        'budgeting.MonthPeriod',
        on_delete=models.CASCADE,
        related_name='expense_actual_expenses',
        help_text='Month period (required)',
    )
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        help_text='OFFICE, PROJECT, or CHARITY',
    )
    category = models.ForeignKey(
        'budgeting.ExpenseCategory',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='expense_actual_expenses',
        help_text='Expense category (optional)',
    )
    account = models.CharField(
        max_length=10,
        choices=ACCOUNT_CHOICES,
        help_text='Source account: Cash (кассадан кетти) or Bank (банктан кетти)',
    )
    currency = models.CharField(
        max_length=3,
        choices=CURRENCY_CHOICES,
        default='KGS',
        help_text='Currency of the expense amount (KGS or USD)',
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text='Amount spent',
    )
    spent_at = models.DateField(help_text='Date when money was spent')
    comment = models.TextField(help_text='Required comment for every expense')
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_expense_actual_expenses',
        help_text='User who created this expense',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-spent_at', '-created_at']
        indexes = [
            models.Index(fields=['month_period', 'scope']),
            models.Index(fields=['category']),
            models.Index(fields=['spent_at']),
            models.Index(fields=['account']),
            models.Index(fields=['account', 'spent_at']),
            models.Index(fields=['currency']),
            models.Index(fields=['account', 'currency', 'spent_at']),
        ]

    def clean(self):
        from apps.expenses.base import validate_expense_category

        if self.category and self.scope:
            scope_map = {'OFFICE': 'office', 'PROJECT': 'project', 'CHARITY': 'charity'}
            expected_scope = scope_map.get(self.scope)
            if expected_scope and self.category.scope != expected_scope:
                raise ValidationError(
                    {'category': f'Category scope "{self.category.scope}" does not match expense scope "{self.scope}".'}
                )
            validate_expense_category(self.category, plan_scope=None)
        if self.account and self.account not in dict(ACCOUNT_CHOICES):
            raise ValidationError("Account must be CASH or BANK.")
        if self.currency and self.currency not in dict(CURRENCY_CHOICES):
            raise ValidationError("Currency must be KGS or USD.")

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.month_period.month} - {self.scope} - {self.amount} on {self.spent_at}"
