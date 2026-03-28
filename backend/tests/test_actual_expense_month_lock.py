"""
Tests for ActualExpense API with MonthPeriod lock semantics.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgeting.models import MonthPeriod, ExpenseCategory
from apps.finance.models import FinancePeriod, IncomeEntry


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

    def test_locked_month_blocks_actualexpense_create(self, api_client, admin_user, locked_month_period, expense_category_office):
        """
        Posted ActualExpense cannot be created when MonthPeriod is LOCKED;
        admin must unlock the month first.
        """
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        prev_month = MonthPeriod.objects.create(month="2026-02", status="OPEN")
        finance_period_office = FinancePeriod.objects.create(
            month_period=prev_month,
            fund_kind="office",
            project=None,
            created_by=admin_user,
        )
        IncomeEntry.objects.create(
            finance_period=finance_period_office,
            account="CASH",
            amount=Decimal("5000.00"),
            received_at="2026-02-15",
            comment="Seed CASH balance before locked month",
            created_by=admin_user,
        )

        payload = {
            "month_period": locked_month_period.id,
            "scope": "OFFICE",
            "category": expense_category_office.id,
            "account": "CASH",
            "amount": "1234.56",
            "spent_at": "2026-03-10",
            "comment": "Locked month actual expense",
        }

        response = api_client.post("/api/v1/actual-expenses/", payload, format="json")
        assert response.status_code == 403

    def test_admin_can_create_actualexpense_after_month_unlocked(
        self, api_client, admin_user, expense_category_office
    ):
        locked = MonthPeriod.objects.create(month="2026-04", status="LOCKED")
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        prev_month = MonthPeriod.objects.create(month="2026-03", status="OPEN")
        fp = FinancePeriod.objects.create(
            month_period=prev_month,
            fund_kind="office",
            project=None,
            created_by=admin_user,
        )
        IncomeEntry.objects.create(
            finance_period=fp,
            account="CASH",
            amount=Decimal("5000.00"),
            received_at="2026-03-15",
            comment="Seed",
            created_by=admin_user,
        )

        payload = {
            "month_period": locked.id,
            "scope": "OFFICE",
            "category": expense_category_office.id,
            "account": "CASH",
            "amount": "100.00",
            "spent_at": "2026-04-05",
            "comment": "After unlock",
        }
        assert api_client.post("/api/v1/actual-expenses/", payload, format="json").status_code == 403

        locked.status = "OPEN"
        locked.save(update_fields=["status"])

        response = api_client.post("/api/v1/actual-expenses/", payload, format="json")
        assert response.status_code == 201
        assert response.data["amount"] == "100.00"
