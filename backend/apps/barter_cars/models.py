"""
Barter car models.

Cars accepted as partial payment for apartments, tracked in a ledger
that is deliberately isolated from finance/budgeting/actuals/expenses.
See .claude/skills/barter-money-isolation/SKILL.md for the rule.
"""
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class CurrencyChoices(models.TextChoices):
    KGS = 'KGS', 'KGS'
    USD = 'USD', 'USD'


class BarterCarStatus(models.TextChoices):
    RECEIVED = 'RECEIVED', 'Received'
    SOLD = 'SOLD', 'Sold'


class BarterCar(models.Model):
    """A car accepted in barter for apartment payment."""

    # Car facts
    brand = models.CharField(max_length=60)
    model = models.CharField(max_length=60)
    year = models.PositiveSmallIntegerField()
    plate_number = models.CharField(max_length=20, blank=True)
    vin = models.CharField(max_length=32, blank=True)
    color = models.CharField(max_length=30, blank=True)
    mileage_km = models.PositiveIntegerField(null=True, blank=True)
    has_tech_passport = models.BooleanField(default=False)
    received_by_dover = models.BooleanField(default=False)

    # Barter origin
    received_from_name = models.CharField(max_length=120)
    received_from_phone = models.CharField(max_length=20, blank=True)
    apartment_ref = models.CharField(max_length=120, blank=True)
    agreed_value = models.DecimalField(max_digits=14, decimal_places=2)
    agreed_currency = models.CharField(
        max_length=3, choices=CurrencyChoices.choices, default=CurrencyChoices.USD
    )
    received_at = models.DateField()

    # Status + sale outcome
    status = models.CharField(
        max_length=20,
        choices=BarterCarStatus.choices,
        default=BarterCarStatus.RECEIVED,
    )
    sold_price = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True
    )
    sold_currency = models.CharField(
        max_length=3, choices=CurrencyChoices.choices, null=True, blank=True
    )
    sold_to_name = models.CharField(max_length=120, blank=True)
    sold_to_phone = models.CharField(max_length=20, blank=True)
    sold_at = models.DateField(null=True, blank=True)

    notes = models.TextField(blank=True)

    # Soft delete + audit columns
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_barter_cars',
    )

    class Meta:
        ordering = ['-received_at', '-id']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['is_active']),
            models.Index(fields=['received_at']),
        ]

    def __str__(self):
        return f"{self.brand} {self.model} {self.year} [{self.status}]"

    def clean(self):
        super().clean()
        if self.status == BarterCarStatus.SOLD:
            missing = [
                name for name in (
                    'sold_price', 'sold_currency', 'sold_at', 'sold_to_name'
                ) if not getattr(self, name)
            ]
            if missing:
                raise ValidationError({
                    field: 'Required when status is SOLD.' for field in missing
                })
        else:
            # Non-SOLD rows must not carry sale fields.
            if any(
                getattr(self, name) for name in (
                    'sold_price', 'sold_currency', 'sold_at', 'sold_to_name', 'sold_to_phone'
                )
            ):
                raise ValidationError(
                    'Sale fields are only allowed when status is SOLD.'
                )

    @property
    def margin(self):
        """sold_price - agreed_value, or None if not sold.

        Only meaningful when sold_currency == agreed_currency; otherwise the
        caller must handle FX themselves. Returned value is in sold_currency.
        """
        if self.status != BarterCarStatus.SOLD or self.sold_price is None:
            return None
        if self.sold_currency != self.agreed_currency:
            return None
        return self.sold_price - self.agreed_value
