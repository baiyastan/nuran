"""
Additional tests for BudgetPlan submit permissions and report payload.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetPlan, MonthPeriod, ExpenseCategory, BudgetLine, BudgetExpense


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin2",
        email="admin2@test.com",
        password="testpass123",
        role="admin",
    )


@pytest.fixture
def director_user(db):
    return User.objects.create_user(
        username="director2",
        email="director2@test.com",
        password="testpass123",
        role="director",
    )


@pytest.fixture
def month_period_open(db):
    return MonthPeriod.objects.create(month="2026-05", status="OPEN")


@pytest.fixture
def budget_plan_open(db, month_period_open, admin_user):
    return BudgetPlan.objects.create(
        period=month_period_open,
        scope="OFFICE",
        project=None,
        status="OPEN",
    )


@pytest.fixture
def expense_category_office(db):
    return ExpenseCategory.objects.create(
        name="Office Test",
        scope="office",
        kind="EXPENSE",
        parent=None,
        is_active=True,
    )


def _auth(client: APIClient, user: User):
    client.force_authenticate(user=user)


class TestBudgetPlanSubmitPermissions:
    def test_admin_can_submit_open_plan(self, db, admin_user, budget_plan_open, expense_category_office):
        client = APIClient()
        _auth(client, admin_user)

        # Ensure at least one budget line exists
        BudgetLine.objects.create(
            plan=budget_plan_open,
            category=expense_category_office,
            amount_planned=Decimal("100.00"),
            note="",
        )

        response = client.post(f"/api/v1/budgets/budgets/{budget_plan_open.id}/submit/")
        assert response.status_code == 200
        budget_plan_open.refresh_from_db()
        assert budget_plan_open.status == "SUBMITTED"

    def test_director_can_submit_open_plan(self, db, director_user, budget_plan_open, expense_category_office):
        client = APIClient()
        _auth(client, director_user)

        BudgetLine.objects.create(
            plan=budget_plan_open,
            category=expense_category_office,
            amount_planned=Decimal("150.00"),
            note="",
        )

        response = client.post(f"/api/v1/budgets/budgets/{budget_plan_open.id}/submit/")
        assert response.status_code == 200
        budget_plan_open.refresh_from_db()
        assert budget_plan_open.status == "SUBMITTED"


class TestBudgetPlanReportPayload:
    def test_report_returns_numeric_fields(self, db, admin_user, month_period_open, expense_category_office):
        client = APIClient()
        _auth(client, admin_user)

        plan = BudgetPlan.objects.create(
            period=month_period_open,
            scope="OFFICE",
            project=None,
            status="APPROVED",
        )

        BudgetLine.objects.create(
            plan=plan,
            category=expense_category_office,
            amount_planned=Decimal("200.50"),
            note="",
        )
        BudgetExpense.objects.create(
            plan=plan,
            category=expense_category_office,
            amount_spent=Decimal("50.25"),
            comment="",
        )

        response = client.get(f"/api/v1/budgets/budgets/{plan.id}/report/")
        assert response.status_code == 200

        data = response.data
        assert "rows" in data and len(data["rows"]) == 1
        row = data["rows"][0]

        # Numeric (not strings) for planned/spent/balance
        assert isinstance(row["planned"], (int, float))
        assert isinstance(row["spent"], (int, float))
        assert isinstance(row["balance"], (int, float))

        totals = data["totals"]
        assert isinstance(totals["planned"], (int, float))
        assert isinstance(totals["spent"], (int, float))
        assert isinstance(totals["balance"], (int, float))

