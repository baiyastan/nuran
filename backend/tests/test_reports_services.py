"""Focused tests for extracted reports service helpers (behavior locks)."""
import pytest

from apps.budgeting.models import MonthPeriod
from apps.reports.services.month_input import get_validated_month_period
from apps.reports.services.transfers import parse_month_to_date_bounds


@pytest.mark.django_db
def test_get_validated_month_period_success():
    mp = MonthPeriod.objects.create(month='2099-01', status='OPEN')
    validated, err = get_validated_month_period('  2099-01  ')
    assert err is None
    assert validated is not None
    month, period = validated
    assert month == '2099-01'
    assert period.pk == mp.pk


@pytest.mark.django_db
def test_get_validated_month_period_missing_returns_400_shape():
    validated, err = get_validated_month_period(None)
    assert validated is None
    assert err is not None
    assert err.status_code == 400
    assert 'month' in err.data


def test_parse_month_to_date_bounds():
    bounds = parse_month_to_date_bounds('2024-06')
    assert bounds is not None
    first, last = bounds
    assert first.year == 2024 and first.month == 6 and first.day == 1
    assert last.month == 6 and last.day == 30


def test_parse_month_to_date_bounds_invalid():
    assert parse_month_to_date_bounds('not-a-month') is None
