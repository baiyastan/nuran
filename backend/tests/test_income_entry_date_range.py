from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import MonthPeriod
from apps.finance.models import FinancePeriod, IncomeEntry, IncomeSource


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_income_range',
        email='admin_income_range@test.com',
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
def finance_period(month_period, admin_user):
    return FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind='office',
        status='open',
        created_by=admin_user,
    )


@pytest.fixture
def source(db):
    return IncomeSource.objects.create(name='Income')


def _create_entry(finance_period, source, created_by, received_at):
    return IncomeEntry.objects.create(
        finance_period=finance_period,
        source=source,
        account='CASH',
        amount=Decimal('200.00'),
        received_at=received_at,
        comment='x',
        created_by=created_by,
    )


def test_income_entries_no_range_unchanged(api_client_admin, admin_user, finance_period, source):
    _create_entry(finance_period, source, admin_user, '2024-02-01')
    _create_entry(finance_period, source, admin_user, '2024-02-20')
    response = api_client_admin.get('/api/v1/income-entries/')
    assert response.status_code == 200
    assert response.data['count'] == 2


def test_income_entries_valid_range_filters_by_received_at(api_client_admin, admin_user, finance_period, source):
    e1 = _create_entry(finance_period, source, admin_user, '2024-02-03')
    _create_entry(finance_period, source, admin_user, '2024-02-12')
    _create_entry(finance_period, source, admin_user, '2024-02-24')
    response = api_client_admin.get('/api/v1/income-entries/?start_date=2024-02-01&end_date=2024-02-10')
    assert response.status_code == 200
    returned_ids = [item['id'] for item in response.data['results']]
    assert returned_ids == [e1.id]


def test_income_entries_invalid_pair_returns_400(api_client_admin):
    response_start_only = api_client_admin.get('/api/v1/income-entries/?start_date=2024-02-01')
    response_end_only = api_client_admin.get('/api/v1/income-entries/?end_date=2024-02-20')
    assert response_start_only.status_code == 400
    assert response_end_only.status_code == 400


def test_income_entries_invalid_order_returns_400(api_client_admin):
    response = api_client_admin.get('/api/v1/income-entries/?start_date=2024-02-20&end_date=2024-02-01')
    assert response.status_code == 400


def test_income_entries_source_null_does_not_apply_source_filter(
    api_client_admin, admin_user, finance_period, source
):
    IncomeEntry.objects.create(
        finance_period=finance_period,
        source=source,
        account='CASH',
        amount=Decimal('200.00'),
        received_at='2024-02-03',
        comment='with source',
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period,
        source=None,
        account='BANK',
        amount=Decimal('300.00'),
        received_at='2024-02-04',
        comment='without source',
        created_by=admin_user,
    )

    response = api_client_admin.get('/api/v1/income-entries/?month=2024-02&source=null')
    assert response.status_code == 200
    assert response.data['count'] == 2


def test_income_entries_source_undefined_or_empty_does_not_apply_source_filter(
    api_client_admin, admin_user, finance_period, source
):
    IncomeEntry.objects.create(
        finance_period=finance_period,
        source=source,
        account='CASH',
        amount=Decimal('200.00'),
        received_at='2024-02-03',
        comment='with source',
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period,
        source=None,
        account='BANK',
        amount=Decimal('300.00'),
        received_at='2024-02-04',
        comment='without source',
        created_by=admin_user,
    )

    response_undefined = api_client_admin.get('/api/v1/income-entries/?month=2024-02&source=undefined')
    response_empty = api_client_admin.get('/api/v1/income-entries/?month=2024-02&source=')

    assert response_undefined.status_code == 200
    assert response_empty.status_code == 200
    assert response_undefined.data['count'] == 2
    assert response_empty.data['count'] == 2
