"""Model-level tests for apps.barter_cars.BarterCar."""
from datetime import date
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.barter_cars.models import BarterCar


@pytest.fixture
def received_car_kwargs():
    return dict(
        brand='Toyota',
        model='Camry',
        year=2018,
        received_from_name='Бакыт уулу',
        agreed_value=Decimal('12000.00'),
        agreed_currency='USD',
        received_at=date(2026, 4, 1),
        has_tech_passport=True,
        received_by_dover=False,
    )


@pytest.mark.django_db
class TestBarterCarModel:
    def test_create_received_car(self, received_car_kwargs):
        car = BarterCar.objects.create(**received_car_kwargs)
        car.full_clean()
        assert car.status == 'RECEIVED'
        assert car.is_active is True
        assert car.margin is None

    def test_sold_requires_sold_fields(self, received_car_kwargs):
        car = BarterCar(status='SOLD', **received_car_kwargs)
        with pytest.raises(ValidationError) as exc:
            car.full_clean()
        missing = set(exc.value.message_dict.keys())
        assert missing == {'sold_price', 'sold_currency', 'sold_at', 'sold_to_name'}

    def test_non_sold_must_not_have_sale_fields(self, received_car_kwargs):
        car = BarterCar(
            status='RECEIVED',
            sold_price=Decimal('10000.00'),
            sold_currency='USD',
            sold_at=date(2026, 4, 15),
            sold_to_name='Buyer',
            **received_car_kwargs,
        )
        with pytest.raises(ValidationError):
            car.full_clean()

    def test_sold_full_snapshot_is_valid(self, received_car_kwargs):
        car = BarterCar(
            status='SOLD',
            sold_price=Decimal('10500.00'),
            sold_currency='USD',
            sold_at=date(2026, 4, 20),
            sold_to_name='Max Auto',
            **received_car_kwargs,
        )
        car.full_clean()
        car.save()
        assert car.margin == Decimal('-1500.00')

    def test_margin_none_when_currencies_differ(self, received_car_kwargs):
        car = BarterCar(
            status='SOLD',
            sold_price=Decimal('900000.00'),
            sold_currency='KGS',
            sold_at=date(2026, 4, 20),
            sold_to_name='Buyer',
            **received_car_kwargs,
        )
        car.save()
        assert car.margin is None

    def test_ordering_is_most_recent_first(self, received_car_kwargs):
        older = BarterCar.objects.create(**{**received_car_kwargs, 'received_at': date(2026, 1, 1)})
        newer = BarterCar.objects.create(**{**received_car_kwargs, 'received_at': date(2026, 3, 1)})
        ids = list(BarterCar.objects.values_list('id', flat=True))
        assert ids == [newer.id, older.id]
