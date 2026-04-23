"""Service-layer tests for apps.barter_cars."""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from apps.audit.models import AuditLog
from apps.barter_cars.models import BarterCar
from apps.barter_cars.services import (
    compute_stats,
    create_barter_car,
    edit_received_car,
    mark_sold,
    soft_delete,
)

User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin-svc', email='admin-svc@test.com', password='pw', role='admin'
    )


@pytest.fixture
def car_kwargs():
    return dict(
        brand='Mercedes',
        model='E200',
        year=2015,
        received_from_name='Нурлан',
        agreed_value=Decimal('15000.00'),
        agreed_currency='USD',
        received_at=date(2026, 3, 10),
        has_tech_passport=True,
    )


@pytest.mark.django_db
class TestCreateBarterCar:
    def test_creates_and_writes_audit(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        assert car.pk is not None
        assert car.status == 'RECEIVED'
        entries = AuditLog.objects.filter(model_name='BarterCar', object_id=car.id)
        assert entries.count() == 1
        entry = entries.get()
        assert entry.action == 'create'
        assert entry.before == {}
        assert entry.after['status'] == 'RECEIVED'
        assert entry.actor_id == admin_user.id

    def test_rejects_sale_fields_at_creation(self, admin_user, car_kwargs):
        with pytest.raises(ValidationError):
            create_barter_car(
                actor=admin_user, sold_price=Decimal('1'), **car_kwargs
            )


@pytest.mark.django_db
class TestMarkSold:
    def test_happy_path(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        mark_sold(
            car,
            sold_price=Decimal('13500.00'),
            sold_currency='USD',
            sold_at=date(2026, 4, 20),
            sold_to_name='Auto Bazar',
            actor=admin_user,
        )
        car.refresh_from_db()
        assert car.status == 'SOLD'
        assert car.sold_price == Decimal('13500.00')
        assert car.margin == Decimal('-1500.00')

        entries = AuditLog.objects.filter(
            model_name='BarterCar', object_id=car.id
        ).order_by('timestamp')
        assert [e.action for e in entries] == ['create', 'update']
        update = entries.last()
        assert update.before['status'] == 'RECEIVED'
        assert update.after['status'] == 'SOLD'
        assert update.after['sold_price'] == '13500.00'

    def test_rejects_when_already_sold(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        mark_sold(
            car,
            sold_price=Decimal('10000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='X',
            actor=admin_user,
        )
        with pytest.raises(ValidationError):
            mark_sold(
                car,
                sold_price=Decimal('10000'), sold_currency='USD',
                sold_at=date(2026, 4, 1), sold_to_name='Y',
                actor=admin_user,
            )

    def test_rejects_when_archived(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        soft_delete(car, actor=admin_user)
        with pytest.raises(ValidationError):
            mark_sold(
                car,
                sold_price=Decimal('10000'), sold_currency='USD',
                sold_at=date(2026, 4, 1), sold_to_name='X',
                actor=admin_user,
            )


@pytest.mark.django_db
class TestEdit:
    def test_edit_received_fields(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        edit_received_car(
            car, actor=admin_user,
            agreed_value=Decimal('14000.00'),
            notes='Корректировка',
        )
        car.refresh_from_db()
        assert car.agreed_value == Decimal('14000.00')
        assert car.notes == 'Корректировка'

    def test_edit_rejects_sale_fields(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        with pytest.raises(ValidationError):
            edit_received_car(car, actor=admin_user, sold_price=Decimal('1'))

    def test_edit_blocked_when_sold(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        mark_sold(
            car,
            sold_price=Decimal('10000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='X',
            actor=admin_user,
        )
        with pytest.raises(ValidationError):
            edit_received_car(car, actor=admin_user, agreed_value=Decimal('1'))


@pytest.mark.django_db
class TestSoftDelete:
    def test_soft_delete_flips_is_active_and_audits(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        soft_delete(car, actor=admin_user)
        car.refresh_from_db()
        assert car.is_active is False
        entry = AuditLog.objects.filter(
            model_name='BarterCar', object_id=car.id, action='delete'
        ).get()
        assert entry.after == {'is_active': False}
        assert entry.before['status'] == 'RECEIVED'

    def test_soft_delete_is_idempotent(self, admin_user, car_kwargs):
        car = create_barter_car(actor=admin_user, **car_kwargs)
        soft_delete(car, actor=admin_user)
        soft_delete(car, actor=admin_user)
        assert AuditLog.objects.filter(
            model_name='BarterCar', object_id=car.id, action='delete'
        ).count() == 1


@pytest.mark.django_db
class TestComputeStats:
    def test_empty(self):
        payload = compute_stats(BarterCar.objects.all())
        assert payload == {
            'received_total': 0, 'sold_total': 0, 'in_stock': 0, 'margin': {}
        }

    def test_mixed_currencies_and_archived(self, admin_user, car_kwargs):
        a = create_barter_car(actor=admin_user, **car_kwargs)
        b = create_barter_car(actor=admin_user, **{**car_kwargs, 'agreed_value': Decimal('10000')})
        c = create_barter_car(actor=admin_user, **{
            **car_kwargs,
            'agreed_currency': 'KGS',
            'agreed_value': Decimal('800000'),
        })
        mark_sold(
            a,
            sold_price=Decimal('13000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='X', actor=admin_user,
        )
        mark_sold(
            c,
            sold_price=Decimal('900000'), sold_currency='KGS',
            sold_at=date(2026, 4, 2), sold_to_name='Y', actor=admin_user,
        )
        soft_delete(b, actor=admin_user)

        payload = compute_stats(BarterCar.objects.all())
        assert payload['received_total'] == 2  # b is archived
        assert payload['sold_total'] == 2
        assert payload['in_stock'] == 0
        assert payload['margin']['USD'] == {
            'sold_count': 1,
            'agreed_sum': '15000.00',
            'sold_sum': '13000.00',
            'margin': '-2000.00',
        }
        assert payload['margin']['KGS'] == {
            'sold_count': 1,
            'agreed_sum': '800000.00',
            'sold_sum': '900000.00',
            'margin': '100000.00',
        }
