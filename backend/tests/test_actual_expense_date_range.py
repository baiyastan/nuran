from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_actual_range',
        email='admin_actual_range@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def api_client_admin(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month='2024-02', status='OPEN')


@pytest.fixture
def category(db):
    return ExpenseCategory.objects.create(name='Office', scope='office', kind='EXPENSE')


def _create_expense(month_period, category, created_by, spent_at):
    return ActualExpense.objects.create(
        month_period=month_period,
        scope='OFFICE',
        category=category,
        account='CASH',
        amount=Decimal('100.00'),
        spent_at=spent_at,
        comment='x',
        created_by=created_by,
    )


def test_actual_expenses_no_range_unchanged(api_client_admin, admin_user, month_period, category):
    _create_expense(month_period, category, admin_user, '2024-02-01')
    _create_expense(month_period, category, admin_user, '2024-02-20')
    response = api_client_admin.get('/api/v1/actual-expenses/?month=2024-02')
    assert response.status_code == 200
    assert response.data['count'] == 2


def test_actual_expenses_valid_range_filters_by_spent_at(api_client_admin, admin_user, month_period, category):
    e1 = _create_expense(month_period, category, admin_user, '2024-02-03')
    _create_expense(month_period, category, admin_user, '2024-02-15')
    _create_expense(month_period, category, admin_user, '2024-02-24')
    response = api_client_admin.get(
        '/api/v1/actual-expenses/?month=2024-02&start_date=2024-02-01&end_date=2024-02-10'
    )
    assert response.status_code == 200
    returned_ids = [item['id'] for item in response.data['results']]
    assert returned_ids == [e1.id]


def test_actual_expenses_only_start_date_returns_400(api_client_admin):
    response = api_client_admin.get('/api/v1/actual-expenses/?month=2024-02&start_date=2024-02-01')
    assert response.status_code == 400


def test_actual_expenses_only_end_date_returns_400(api_client_admin):
    response = api_client_admin.get('/api/v1/actual-expenses/?month=2024-02&end_date=2024-02-10')
    assert response.status_code == 400


def test_actual_expenses_start_after_end_returns_400(api_client_admin):
    response = api_client_admin.get(
        '/api/v1/actual-expenses/?month=2024-02&start_date=2024-02-20&end_date=2024-02-10'
    )
    assert response.status_code == 400
