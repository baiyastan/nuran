"""
Tests for ActualExpense API with MonthPeriod lock semantics.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgeting.models import MonthPeriod, ExpenseCategory
from apps.expenses.models import ActualExpense


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
def locked_month_period(db):
    return MonthPeriod.objects.create(month="2026-03", status="LOCKED")


@pytest.fixture
def expense_category_office(db):
    return ExpenseCategory.objects.create(
        name="Office Category",
        scope="office",
        kind="EXPENSE",
        parent=None,
        is_active=True,
    )


class TestActualExpenseMonthLock:
    """Fact-side ActualExpense behavior with MonthPeriod locks."""

    def test_locked_month_allows_actualexpense_create(self, api_client, admin_user, locked_month_period, expense_category_office):
        """
        Creating ActualExpense is allowed when MonthPeriod is LOCKED,
        as long as the month exists and permissions allow.
        """
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        payload = {
            "month_period": locked_month_period.id,
            "scope": "OFFICE",
            "category": expense_category_office.id,
            "amount": "1234.56",
            "spent_at": "2026-03-10",
            "comment": "Locked month actual expense",
        }

        response = api_client.post("/api/v1/actual-expenses/", payload, format="json")
        assert response.status_code == 201
        assert response.data["amount"] == "1234.56"
        assert response.data["comment"] == "Locked month actual expense"

        actual = ActualExpense.objects.get(id=response.data["id"])
        assert actual.month_period == locked_month_period
        assert actual.month_period.status == "LOCKED"

