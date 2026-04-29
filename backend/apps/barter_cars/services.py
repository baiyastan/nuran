"""
Barter car services.

This module MUST NOT import from apps.finance, apps.budgeting, apps.actuals,
apps.expenses, apps.planning, apps.plans.  See
.claude/skills/barter-money-isolation/SKILL.md and
scripts/check_barter_isolation.py.
"""
from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction

from apps.audit.models import AuditLog

from .models import BarterCar, BarterCarStatus


def _snapshot(car: BarterCar) -> dict:
    return {
        'status': car.status,
        'agreed_value': str(car.agreed_value),
        'agreed_currency': car.agreed_currency,
        'sold_price': str(car.sold_price) if car.sold_price is not None else None,
        'sold_currency': car.sold_currency,
        'sold_at': car.sold_at.isoformat() if car.sold_at else None,
        'sold_to_name': car.sold_to_name,
        'sold_to_phone': car.sold_to_phone,
    }


@transaction.atomic
def create_barter_car(*, actor, **fields) -> BarterCar:
    """Create a barter car and write a create audit entry.

    Sale fields must not be passed at creation — new cars start RECEIVED.
    """
    sale_fields = {'sold_price', 'sold_currency', 'sold_at', 'sold_to_name', 'sold_to_phone'}
    leaked = sale_fields & fields.keys()
    if leaked:
        raise ValidationError(
            f'Sale fields cannot be set at creation: {sorted(leaked)}'
        )
    car = BarterCar(created_by=actor, **fields)
    car.status = BarterCarStatus.RECEIVED
    car.full_clean()
    car.save()
    AuditLog.objects.create(
        actor=actor,
        action='create',
        model_name='BarterCar',
        object_id=car.id,
        before={},
        after=_snapshot(car),
    )
    return car


@transaction.atomic
def mark_sold(
    car: BarterCar,
    *,
    sold_price: Decimal,
    sold_currency: str,
    sold_at,
    sold_to_name: str,
    sold_to_phone: str = '',
    actor,
) -> BarterCar:
    """Transition a RECEIVED car to SOLD and record the outcome.

    Does NOT write to finance / budgeting / actuals / expenses / plans —
    see barter-money-isolation skill.
    """
    if car.status != BarterCarStatus.RECEIVED:
        raise ValidationError('Only RECEIVED cars can be marked sold.')
    if not car.is_active:
        raise ValidationError('Archived cars cannot be marked sold.')

    before = _snapshot(car)
    car.status = BarterCarStatus.SOLD
    car.sold_price = sold_price
    car.sold_currency = sold_currency
    car.sold_at = sold_at
    car.sold_to_name = sold_to_name
    car.sold_to_phone = sold_to_phone
    car.full_clean()
    car.save()
    AuditLog.objects.create(
        actor=actor,
        action='update',
        model_name='BarterCar',
        object_id=car.id,
        before=before,
        after=_snapshot(car),
    )
    return car


@transaction.atomic
def edit_received_car(car: BarterCar, *, actor, **fields) -> BarterCar:
    """Edit a RECEIVED car's facts.  SOLD cars are read-only."""
    if car.status == BarterCarStatus.SOLD:
        raise ValidationError('Sold cars cannot be edited.')
    if not car.is_active:
        raise ValidationError('Archived cars cannot be edited.')
    sale_fields = {'sold_price', 'sold_currency', 'sold_at', 'sold_to_name', 'sold_to_phone', 'status'}
    leaked = sale_fields & fields.keys()
    if leaked:
        raise ValidationError(
            f'These fields cannot be edited directly: {sorted(leaked)}'
        )

    before = _snapshot(car)
    for k, v in fields.items():
        setattr(car, k, v)
    car.full_clean()
    car.save()
    AuditLog.objects.create(
        actor=actor,
        action='update',
        model_name='BarterCar',
        object_id=car.id,
        before=before,
        after=_snapshot(car),
    )
    return car


@transaction.atomic
def soft_delete(car: BarterCar, *, actor) -> BarterCar:
    """Mark inactive; audit logs the prior snapshot."""
    if not car.is_active:
        return car
    before = _snapshot(car)
    car.is_active = False
    car.save(update_fields=['is_active', 'updated_at'])
    AuditLog.objects.create(
        actor=actor,
        action='delete',
        model_name='BarterCar',
        object_id=car.id,
        before=before,
        after={'is_active': False},
    )
    return car


def compute_stats(queryset) -> dict:
    """Compute KPI payload for the admin stats endpoint.

    Margin is split per-currency (no cross-currency aggregation).
    """
    qs = queryset.filter(is_active=True)
    received_total = qs.count()
    sold_qs = qs.filter(status=BarterCarStatus.SOLD)
    sold_total = sold_qs.count()
    in_stock = qs.filter(status=BarterCarStatus.RECEIVED).count()

    margin: dict[str, dict] = {}
    for currency in ('KGS', 'USD'):
        subset = sold_qs.filter(agreed_currency=currency, sold_currency=currency)
        sold_count = subset.count()
        if sold_count == 0:
            continue
        agreed_sum = Decimal('0')
        sold_sum = Decimal('0')
        for row in subset.only('agreed_value', 'sold_price'):
            agreed_sum += row.agreed_value
            sold_sum += row.sold_price
        margin[currency] = {
            'sold_count': sold_count,
            'agreed_sum': str(agreed_sum),
            'sold_sum': str(sold_sum),
            'margin': str(sold_sum - agreed_sum),
        }

    return {
        'received_total': received_total,
        'sold_total': sold_total,
        'in_stock': in_stock,
        'margin': margin,
    }


__all__ = [
    'create_barter_car',
    'mark_sold',
    'edit_received_car',
    'soft_delete',
    'compute_stats',
    '_snapshot',
]
