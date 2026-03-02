"""
Tests for BudgetLine bulk upsert and MonthPeriod lock semantics.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.budgeting.models import MonthPeriod, BudgetPlan, ExpenseCategory, BudgetLine


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
def budget_plan_locked(db, locked_month_period):
    return BudgetPlan.objects.create(
        period=locked_month_period,
        scope="OFFICE",
        project=None,
        status="OPEN",
    )


@pytest.fixture
def expense_category_office_leaf(db):
    return ExpenseCategory.objects.create(
        name="Office Leaf",
        scope="office",
        kind="EXPENSE",
        parent=None,
        is_active=True,
    )


class TestBudgetLineMonthLock:
    """Plan-side BudgetLine behavior with MonthPeriod locks."""

    def test_locked_month_blocks_budgetline_bulkupsert_for_admin(
        self,
        api_client,
        admin_user,
        budget_plan_locked,
        expense_category_office_leaf,
    ):
        """
        Bulk upsert must fail with 403 for all roles, including admin,
        when the related MonthPeriod is LOCKED.
        """
        token = RefreshToken.for_user(admin_user)
        api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

        payload = {
            "plan": budget_plan_locked.id,
            "items": [
                {
                    "category": expense_category_office_leaf.id,
                    "amount_planned": "1000.00",
                    "note": "Test line",
                }
            ],
        }

        response = api_client.post(
            "/api/v1/budgets/budget-lines/bulk-upsert/", payload, format="json"
        )
        assert response.status_code == 403
        assert "detail" in response.data
        assert "month" in response.data["detail"].lower() or "locked" in response.data["detail"].lower()

        # Ensure no BudgetLine was created
        assert not BudgetLine.objects.filter(plan=budget_plan_locked).exists()

