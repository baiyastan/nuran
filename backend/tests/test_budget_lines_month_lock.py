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
def foreman_user(db):
    return User.objects.create_user(
        username="foreman_budget",
        email="foreman_budget@test.com",
        password="testpass123",
        role="foreman",
    )


@pytest.fixture
def director_user(db):
    return User.objects.create_user(
        username="director_budget",
        email="director_budget@test.com",
        password="testpass123",
        role="director",
    )


@pytest.fixture
def open_month_period(db):
    return MonthPeriod.objects.create(month="2026-04", status="OPEN")


@pytest.fixture
def locked_month_period(db):
    return MonthPeriod.objects.create(month="2026-03", status="LOCKED")


@pytest.fixture
def budget_plan_project_draft_open_month(db, open_month_period):
    return BudgetPlan.objects.create(
        period=open_month_period,
        scope="PROJECT",
        project=None,
        status="DRAFT",
    )


@pytest.fixture
def budget_plan_project_draft_locked_month(db, locked_month_period):
    return BudgetPlan.objects.create(
        period=locked_month_period,
        scope="PROJECT",
        project=None,
        status="DRAFT",
    )


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


@pytest.fixture
def expense_category_project_leaf(db):
    return ExpenseCategory.objects.create(
        name="Project Leaf",
        scope="project",
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

    def test_foreman_can_bulk_upsert_project_plan_lines_when_month_open_even_if_plan_draft(
        self,
        api_client,
        foreman_user,
        budget_plan_project_draft_open_month,
        expense_category_project_leaf,
    ):
        api_client.force_authenticate(user=foreman_user)
        payload = {
            "plan": budget_plan_project_draft_open_month.id,
            "items": [
                {
                    "category": expense_category_project_leaf.id,
                    "amount_planned": "1200.00",
                    "note": "Foreman upsert",
                }
            ],
        }

        response = api_client.post(
            "/api/v1/budgets/budget-lines/bulk-upsert/", payload, format="json"
        )
        assert response.status_code == 200
        assert response.data["created"] == 1
        line = BudgetLine.objects.get(
            plan=budget_plan_project_draft_open_month,
            category=expense_category_project_leaf,
        )
        assert str(line.amount_planned) == "1200.00"

    def test_foreman_cannot_bulk_upsert_when_month_locked(
        self,
        api_client,
        foreman_user,
        budget_plan_project_draft_locked_month,
        expense_category_project_leaf,
    ):
        api_client.force_authenticate(user=foreman_user)
        payload = {
            "plan": budget_plan_project_draft_locked_month.id,
            "items": [
                {
                    "category": expense_category_project_leaf.id,
                    "amount_planned": "500.00",
                    "note": "Should fail on locked month",
                }
            ],
        }

        response = api_client.post(
            "/api/v1/budgets/budget-lines/bulk-upsert/", payload, format="json"
        )
        assert response.status_code == 403
        assert "detail" in response.data
        assert "month" in response.data["detail"].lower() or "locked" in response.data["detail"].lower()

    def test_director_still_cannot_write_budget_lines(
        self,
        api_client,
        director_user,
        budget_plan_project_draft_open_month,
        expense_category_project_leaf,
    ):
        api_client.force_authenticate(user=director_user)
        payload = {
            "plan": budget_plan_project_draft_open_month.id,
            "items": [
                {
                    "category": expense_category_project_leaf.id,
                    "amount_planned": "700.00",
                    "note": "Director should be read-only",
                }
            ],
        }

        response = api_client.post(
            "/api/v1/budgets/budget-lines/bulk-upsert/", payload, format="json"
        )
        assert response.status_code == 403

    def test_admin_behavior_unchanged_bulk_upsert_allowed_when_month_open(
        self,
        api_client,
        admin_user,
        budget_plan_project_draft_open_month,
        expense_category_project_leaf,
    ):
        api_client.force_authenticate(user=admin_user)
        payload = {
            "plan": budget_plan_project_draft_open_month.id,
            "items": [
                {
                    "category": expense_category_project_leaf.id,
                    "amount_planned": "900.00",
                    "note": "Admin upsert",
                }
            ],
        }

        response = api_client.post(
            "/api/v1/budgets/budget-lines/bulk-upsert/", payload, format="json"
        )
        assert response.status_code == 200
        assert response.data["created"] == 1

