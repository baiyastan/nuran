"""API-layer tests for apps.barter_cars (role gating, CRUD, custom actions)."""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.barter_cars.models import BarterCar
from apps.barter_cars.services import create_barter_car, mark_sold

User = get_user_model()


@pytest.fixture
def admin(db):
    return User.objects.create_user(
        username='admin-api', email='admin-api@test.com', password='pw', role='admin'
    )


@pytest.fixture
def director(db):
    return User.objects.create_user(
        username='dir-api', email='dir-api@test.com', password='pw', role='director'
    )


@pytest.fixture
def foreman(db):
    return User.objects.create_user(
        username='fm-api', email='fm-api@test.com', password='pw', role='foreman'
    )


def _client(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


@pytest.fixture
def admin_client(admin):
    return _client(admin)


@pytest.fixture
def car_payload():
    return {
        'brand': 'Toyota',
        'model': 'Camry',
        'year': 2019,
        'received_from_name': 'Айбек',
        'received_from_phone': '+996555111222',
        'agreed_value': '12000.00',
        'agreed_currency': 'USD',
        'received_at': '2026-04-01',
        'apartment_ref': 'Проект Ала-Тоо, Блок Б, кв.42',
        'has_tech_passport': True,
        'received_by_dover': False,
    }


@pytest.mark.django_db
class TestRoleGating:
    def test_anonymous_gets_401(self, car_payload):
        r = APIClient().get('/api/v1/barter-cars/')
        assert r.status_code == 401

    def test_director_gets_403(self, director, car_payload):
        r = _client(director).get('/api/v1/barter-cars/')
        assert r.status_code == 403

    def test_foreman_gets_403(self, foreman):
        r = _client(foreman).get('/api/v1/barter-cars/')
        assert r.status_code == 403

    def test_admin_gets_200(self, admin_client):
        r = admin_client.get('/api/v1/barter-cars/')
        assert r.status_code == 200

    def test_foreman_cannot_mark_sold(self, admin, foreman, car_payload):
        car = create_barter_car(actor=admin, **{
            'brand': 'Kia', 'model': 'Rio', 'year': 2012,
            'received_from_name': 'X', 'agreed_value': Decimal('5000'),
            'agreed_currency': 'USD', 'received_at': date(2026, 3, 1),
        })
        r = _client(foreman).post(
            f'/api/v1/barter-cars/{car.id}/mark-sold/',
            {'sold_price': '4500', 'sold_currency': 'USD',
             'sold_at': '2026-04-01', 'sold_to_name': 'Buyer'},
            format='json',
        )
        assert r.status_code == 403


@pytest.mark.django_db
class TestCreateListDetail:
    def test_create_list_detail_roundtrip(self, admin_client, car_payload):
        r = admin_client.post('/api/v1/barter-cars/', car_payload, format='json')
        assert r.status_code == 201, r.content
        car_id = r.json()['id']

        r = admin_client.get('/api/v1/barter-cars/')
        body = r.json()
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        assert any(row['id'] == car_id for row in results)

        r = admin_client.get(f'/api/v1/barter-cars/{car_id}/')
        assert r.status_code == 200
        assert r.json()['brand'] == 'Toyota'
        assert r.json()['status'] == 'RECEIVED'

    def test_create_ignores_client_supplied_status(self, admin_client, car_payload):
        payload = {**car_payload, 'status': 'SOLD', 'sold_price': '999'}
        r = admin_client.post('/api/v1/barter-cars/', payload, format='json')
        assert r.status_code == 201
        assert r.json()['status'] == 'RECEIVED'
        assert r.json()['sold_price'] is None

    def test_patch_on_received(self, admin_client, car_payload):
        r = admin_client.post('/api/v1/barter-cars/', car_payload, format='json')
        car_id = r.json()['id']
        r = admin_client.patch(
            f'/api/v1/barter-cars/{car_id}/',
            {'agreed_value': '13500.00', 'notes': 'Оңдоо'},
            format='json',
        )
        assert r.status_code == 200, r.content
        assert r.json()['agreed_value'] == '13500.00'
        assert r.json()['notes'] == 'Оңдоо'

    def test_soft_delete_hides_from_list(self, admin_client, car_payload):
        r = admin_client.post('/api/v1/barter-cars/', car_payload, format='json')
        car_id = r.json()['id']
        r = admin_client.delete(f'/api/v1/barter-cars/{car_id}/')
        assert r.status_code == 204

        body = admin_client.get('/api/v1/barter-cars/').json()
        results = body['results'] if isinstance(body, dict) and 'results' in body else body
        assert all(row['id'] != car_id for row in results)

        body2 = admin_client.get('/api/v1/barter-cars/?include_archived=true').json()
        results2 = body2['results'] if isinstance(body2, dict) and 'results' in body2 else body2
        assert any(row['id'] == car_id for row in results2)


@pytest.mark.django_db
class TestMarkSoldEndpoint:
    def test_happy_path(self, admin_client, car_payload):
        r = admin_client.post('/api/v1/barter-cars/', car_payload, format='json')
        car_id = r.json()['id']
        r = admin_client.post(
            f'/api/v1/barter-cars/{car_id}/mark-sold/',
            {
                'sold_price': '11200.00', 'sold_currency': 'USD',
                'sold_at': '2026-04-20', 'sold_to_name': 'Max Auto',
                'sold_to_phone': '+996700111', 'notes': 'Нак акча',
            },
            format='json',
        )
        assert r.status_code == 200, r.content
        body = r.json()
        assert body['status'] == 'SOLD'
        assert body['sold_price'] == '11200.00'
        assert body['margin'] == '-800.00'
        assert '[sold] Нак акча' in body['notes']

    def test_rejects_if_already_sold(self, admin_client, admin, car_payload):
        car = create_barter_car(actor=admin, **{
            'brand': 'BMW', 'model': 'X5', 'year': 2014,
            'received_from_name': 'X', 'agreed_value': Decimal('20000'),
            'agreed_currency': 'USD', 'received_at': date(2026, 3, 1),
        })
        mark_sold(
            car, sold_price=Decimal('18000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='Y', actor=admin,
        )
        r = admin_client.post(
            f'/api/v1/barter-cars/{car.id}/mark-sold/',
            {'sold_price': '18000', 'sold_currency': 'USD',
             'sold_at': '2026-04-01', 'sold_to_name': 'Z'},
            format='json',
        )
        assert r.status_code == 400

    def test_cannot_patch_sold_car(self, admin_client, admin, car_payload):
        car = create_barter_car(actor=admin, **{
            'brand': 'Audi', 'model': 'A6', 'year': 2016,
            'received_from_name': 'X', 'agreed_value': Decimal('22000'),
            'agreed_currency': 'USD', 'received_at': date(2026, 3, 1),
        })
        mark_sold(
            car, sold_price=Decimal('20000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='Y', actor=admin,
        )
        r = admin_client.patch(
            f'/api/v1/barter-cars/{car.id}/',
            {'agreed_value': '1.00'},
            format='json',
        )
        assert r.status_code == 400

    def test_missing_required_fields(self, admin_client, car_payload):
        r = admin_client.post('/api/v1/barter-cars/', car_payload, format='json')
        car_id = r.json()['id']
        r = admin_client.post(
            f'/api/v1/barter-cars/{car_id}/mark-sold/',
            {'sold_price': '1.00'},
            format='json',
        )
        assert r.status_code == 400


@pytest.mark.django_db
class TestStatsEndpoint:
    def test_empty(self, admin_client):
        r = admin_client.get('/api/v1/barter-cars/stats/')
        assert r.status_code == 200
        assert r.json() == {
            'received_total': 0, 'sold_total': 0, 'in_stock': 0, 'margin': {}
        }

    def test_populated(self, admin_client, admin):
        # USD received + sold at loss
        usd_car = create_barter_car(actor=admin, **{
            'brand': 'Toyota', 'model': 'Camry', 'year': 2018,
            'received_from_name': 'A', 'agreed_value': Decimal('15000'),
            'agreed_currency': 'USD', 'received_at': date(2026, 3, 1),
        })
        mark_sold(
            usd_car, sold_price=Decimal('13000'), sold_currency='USD',
            sold_at=date(2026, 4, 1), sold_to_name='Buy1', actor=admin,
        )
        # KGS received, still in stock
        create_barter_car(actor=admin, **{
            'brand': 'Honda', 'model': 'Fit', 'year': 2012,
            'received_from_name': 'B', 'agreed_value': Decimal('500000'),
            'agreed_currency': 'KGS', 'received_at': date(2026, 3, 15),
        })
        r = admin_client.get('/api/v1/barter-cars/stats/')
        body = r.json()
        assert body['received_total'] == 2
        assert body['sold_total'] == 1
        assert body['in_stock'] == 1
        assert body['margin']['USD']['margin'] == '-2000.00'
        assert 'KGS' not in body['margin']  # nothing sold in KGS
