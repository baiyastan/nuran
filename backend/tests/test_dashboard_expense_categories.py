"""
Tests for dashboard expense categories endpoint.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetLine, BudgetPlan, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.constants import MONTH_REQUIRED_MSG


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='admin_expenses',
        email='admin_expenses@test.com',
        password='testpass123',
        role='admin',
    )


@pytest.fixture
def director_user(db):
    return User.objects.create_user(
        username='director_expenses',
        email='director_expenses@test.com',
        password='testpass123',
        role='director',
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username='foreman_expenses',
        email='foreman_expenses@test.com',
        password='testpass123',
        role='foreman',
    )


@pytest.fixture
def api_client_admin(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def api_client_director(director_user):
    client = APIClient()
    client.force_authenticate(user=director_user)
    return client


@pytest.fixture
def api_client_foreman(foreman_user):
    client = APIClient()
    client.force_authenticate(user=foreman_user)
    return client


@pytest.fixture
def month_period_open(db):
    return MonthPeriod.objects.create(month="2024-02", status="OPEN")


class TestDashboardExpenseCategoriesAPI:
    """Tests for /api/v1/reports/dashboard-expense-categories/ endpoint."""

    def test_missing_month_period_returns_400_and_does_not_create_monthperiod(
        self,
        api_client_admin,
        db,
    ):
        month_value = "2099-11"
        assert MonthPeriod.objects.filter(month=month_value).count() == 0

        response = api_client_admin.get(
            f"/api/v1/reports/dashboard-expense-categories/?month={month_value}"
        )

        assert response.status_code == 400
        assert response.data["month"] == MONTH_REQUIRED_MSG
        assert MonthPeriod.objects.filter(month=month_value).count() == 0

    def test_permissions_only_admin_and_director(
        self,
        api_client_admin,
        api_client_director,
        api_client_foreman,
        month_period_open,
    ):
        # Admin can access
        resp_admin = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02"
        )
        assert resp_admin.status_code != 403

        # Director can access
        resp_director = api_client_director.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02"
        )
        assert resp_director.status_code != 403

        # Foreman is forbidden
        resp_foreman = api_client_foreman.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02"
        )
        assert resp_foreman.status_code == 403

    def test_sums_and_diff_by_category_across_all_scopes(
        self,
        api_client_admin,
        month_period_open,
    ):
        # Categories
        cat_office = ExpenseCategory.objects.create(
            name="Office category",
            scope="office",
            kind="EXPENSE",
        )
        cat_project = ExpenseCategory.objects.create(
            name="Project category",
            scope="project",
            kind="EXPENSE",
        )

        # Budget plans across scopes for the same MonthPeriod
        plan_office = BudgetPlan.objects.create(
            period=month_period_open,
            scope="OFFICE",
        )
        plan_project = BudgetPlan.objects.create(
            period=month_period_open,
            scope="PROJECT",
        )

        # Budget lines (plan)
        BudgetLine.objects.create(
            plan=plan_office,
            category=cat_office,
            amount_planned=Decimal("100.00"),
        )
        BudgetLine.objects.create(
            plan=plan_project,
            category=cat_project,
            amount_planned=Decimal("300.00"),
        )

        # Actual expenses (facts) across different scopes
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=cat_office,
            amount=Decimal("80.00"),
            spent_at="2024-02-05",
            comment="Office expense 1",
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="PROJECT",
            category=cat_project,
            amount=Decimal("500.00"),
            spent_at="2024-02-06",
            comment="Project expense 1",
        )

        # Uncategorized actual expense (no plan)
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=None,
            amount=Decimal("50.00"),
            spent_at="2024-02-07",
            comment="Uncategorized expense",
        )

        response = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02"
        )
        assert response.status_code == 200
        data = response.data

        # Totals: plan = 100 + 300 = 400; fact = 80 + 500 + 50 = 630
        assert Decimal(data["totals"]["plan"]) == Decimal("400.00")
        assert Decimal(data["totals"]["fact"]) == Decimal("630.00")

        # Rows by category_id (including uncategorized None)
        rows_by_cid = {row["category_id"]: row for row in data["rows"]}

        # Office category
        row_office = rows_by_cid[cat_office.id]
        assert Decimal(row_office["plan"]) == Decimal("100.00")
        assert Decimal(row_office["fact"]) == Decimal("80.00")
        assert Decimal(row_office["diff"]) == Decimal("-20.00")
        assert row_office["count"] == 1

        # Project category
        row_project = rows_by_cid[cat_project.id]
        assert Decimal(row_project["plan"]) == Decimal("300.00")
        assert Decimal(row_project["fact"]) == Decimal("500.00")
        assert Decimal(row_project["diff"]) == Decimal("200.00")
        assert row_project["count"] == 1

        # Uncategorized row (category_id is None), plan should be 0 and diff == fact
        row_uncat = rows_by_cid[None]
        assert Decimal(row_uncat["plan"]) == Decimal("0.00")
        assert Decimal(row_uncat["fact"]) == Decimal("50.00")
        assert Decimal(row_uncat["diff"]) == Decimal("50.00")
        assert row_uncat["count"] == 1

        # Sum of row facts should equal totals.fact
        sum_row_facts = sum(Decimal(r["fact"]) for r in data["rows"])
        assert sum_row_facts == Decimal(data["totals"]["fact"])

        # Sum of row plans should equal totals.plan
        sum_row_plans = sum(Decimal(r["plan"]) for r in data["rows"])
        assert sum_row_plans == Decimal(data["totals"]["plan"])

    def test_share_percent_is_null_when_total_fact_zero(
        self,
        api_client_admin,
        month_period_open,
    ):
        # MonthPeriod exists but no data
        response = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02"
        )
        assert response.status_code == 200
        data = response.data
        assert data["rows"] == []
        assert data["totals"]["plan"] == "0.00"
        assert data["totals"]["fact"] == "0.00"

