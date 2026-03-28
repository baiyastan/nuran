"""
Tests for IncomeEntry API with MonthPeriod lock semantics.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgeting.models import MonthPeriod
from apps.finance.models import FinancePeriod, IncomeSource


User = get_user_model()


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin",
        email="admin@test.com",
        password="testpass123",
        role="admin",
    )


@pytest.fixture
def director_user(db):
    return User.objects.create_user(
        username="director",
        email="director@test.com",
        password="testpass123",
        role="director",
    )


@pytest.fixture
def locked_month_period(db):
    return MonthPeriod.objects.create(month="2026-03", status="LOCKED")


@pytest.fixture
def finance_period_locked(db, locked_month_period, admin_user):
    return FinancePeriod.objects.create(
        month_period=locked_month_period,
        fund_kind="office",
        project=None,
        status="locked",
        created_by=admin_user,
    )


@pytest.fixture
def income_source(db):
    return IncomeSource.objects.create(name="Test Source", is_active=True)


class TestIncomeEntryMonthLock:
    """Fact-side IncomeEntry behavior with MonthPeriod locks."""

    def test_locked_month_blocks_incomeentry_create_for_director(
        self,
        api_client,
        director_user,
        income_source,
        finance_period_locked,
    ):
        """Director is read-only on posted income; POST is denied (403), not a silent month bypass."""
        token = RefreshToken.for_user(director_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        payload = {
            "finance_period": finance_period_locked.id,
            "source_id": income_source.id,
            "account": "CASH",
            "amount": "10000.00",
            "received_at": "2026-03-15",
            "comment": "Director entry in locked month",
        }

        response = api_client.post("/api/v1/income-entries/", payload, format="json")
        assert response.status_code == 403

    def test_locked_month_blocks_incomeentry_create_for_admin(
        self,
        api_client,
        admin_user,
        income_source,
        finance_period_locked,
    ):
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        payload = {
            "finance_period": finance_period_locked.id,
            "source_id": income_source.id,
            "account": "CASH",
            "amount": "500.00",
            "received_at": "2026-03-10",
            "comment": "Admin in locked month",
        }
        assert api_client.post("/api/v1/income-entries/", payload, format="json").status_code == 403

    def test_admin_can_create_income_entry_after_month_unlocked(
        self,
        api_client,
        admin_user,
        income_source,
        finance_period_locked,
    ):
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        payload = {
            "finance_period": finance_period_locked.id,
            "source_id": income_source.id,
            "account": "CASH",
            "amount": "250.00",
            "received_at": "2026-03-12",
            "comment": "After unlock",
        }
        mp = finance_period_locked.month_period
        mp.status = "OPEN"
        mp.save(update_fields=["status"])

        response = api_client.post("/api/v1/income-entries/", payload, format="json")
        assert response.status_code == 201
        assert response.data["amount"] == "250.00"
