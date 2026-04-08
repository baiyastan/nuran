"""
Tests for dashboard expense categories endpoint.
"""
from decimal import Decimal
from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetLine, BudgetPlan, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.reports.services import dashboard as dashboard_service


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
        admin_user,
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
            account='CASH',
            amount=Decimal("80.00"),
            spent_at="2024-02-05",
            comment="Office expense 1",
            created_by=admin_user,
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="PROJECT",
            category=cat_project,
            account='CASH',
            amount=Decimal("500.00"),
            spent_at="2024-02-06",
            comment="Project expense 1",
            created_by=admin_user,
        )

        # Uncategorized actual expense (no plan)
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=None,
            account='CASH',
            amount=Decimal("50.00"),
            spent_at="2024-02-07",
            comment="Uncategorized expense",
            created_by=admin_user,
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

    def test_date_range_narrows_fact_only_and_shape_unchanged(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        category = ExpenseCategory.objects.create(
            name="Range category",
            scope="office",
            kind="EXPENSE",
        )
        plan = BudgetPlan.objects.create(period=month_period_open, scope="OFFICE")
        BudgetLine.objects.create(
            plan=plan,
            category=category,
            amount_planned=Decimal("300.00"),
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='CASH',
            amount=Decimal("100.00"),
            spent_at="2024-02-01",
            comment="out of range",
            created_by=admin_user,
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='CASH',
            amount=Decimal("50.00"),
            spent_at="2024-02-20",
            comment="in range",
            created_by=admin_user,
        )

        no_range = api_client_admin.get("/api/v1/reports/dashboard-expense-categories/?month=2024-02")
        with_range = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02&start_date=2024-02-15&end_date=2024-02-28"
        )
        assert no_range.status_code == 200
        assert with_range.status_code == 200
        assert Decimal(no_range.data["totals"]["fact"]) == Decimal("150.00")
        assert Decimal(with_range.data["totals"]["fact"]) == Decimal("50.00")
        assert Decimal(with_range.data["totals"]["plan"]) == Decimal("300.00")
        row = with_range.data["rows"][0]
        assert set(row.keys()) == {"category_id", "category_name", "plan", "fact", "diff", "count", "sharePercent"}

    def test_date_range_validation_errors_return_400(self, api_client_admin, month_period_open):
        only_start = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02&start_date=2024-02-01"
        )
        invalid_order = api_client_admin.get(
            "/api/v1/reports/dashboard-expense-categories/?month=2024-02&start_date=2024-02-10&end_date=2024-02-01"
        )
        assert only_start.status_code == 400
        assert invalid_order.status_code == 400

    def test_export_expense_categories_pdf_returns_attachment(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        category = ExpenseCategory.objects.create(
            name="Office export category",
            scope="office",
            kind="EXPENSE",
        )
        plan = BudgetPlan.objects.create(
            period=month_period_open,
            scope="OFFICE",
        )
        BudgetLine.objects.create(
            plan=plan,
            category=category,
            amount_planned=Decimal("310.00"),
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='CASH',
            amount=Decimal("280.00"),
            spent_at="2024-02-14",
            comment="Expense export row",
            created_by=admin_user,
        )

        response = api_client_admin.get(
            "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=expense_categories"
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert 'attachment; filename="2024-02_expense_categories_report.pdf"' == response["Content-Disposition"]
        assert response.content.startswith(b"%PDF")

    def test_export_section_pdf_accepts_range_and_account_filters(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        category = ExpenseCategory.objects.create(
            name="Office export filtered",
            scope="office",
            kind="EXPENSE",
        )
        plan = BudgetPlan.objects.create(period=month_period_open, scope="OFFICE")
        BudgetLine.objects.create(plan=plan, category=category, amount_planned=Decimal("200.00"))
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='CASH',
            amount=Decimal("110.00"),
            spent_at="2024-02-11",
            comment="inside",
            created_by=admin_user,
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='BANK',
            amount=Decimal("90.00"),
            spent_at="2024-02-25",
            comment="outside by account",
            created_by=admin_user,
        )
        response = api_client_admin.get(
            "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=expense_categories&start_date=2024-02-10&end_date=2024-02-20&account=CASH"
        )
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"

        section_data = dashboard_service.build_dashboard_expense_categories_data(
            "2024-02",
            month_period_open,
            account="CASH",
            start_date=date(2024, 2, 10),
            end_date=date(2024, 2, 20),
        )
        assert Decimal(section_data["totals"]["fact"]) == Decimal("110.00")

    def test_export_section_pdf_forbids_foreman(
        self,
        api_client_foreman,
        month_period_open,
    ):
        response = api_client_foreman.get(
            "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=expense_categories"
        )

        assert response.status_code == 403

    def test_export_expense_category_detail_pdf_returns_attachment(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        category = ExpenseCategory.objects.create(
            name="Office detail export category",
            scope="office",
            kind="EXPENSE",
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='CASH',
            amount=Decimal("180.00"),
            spent_at="2024-02-15",
            comment="Expense detail export row",
            created_by=admin_user,
        )

        response = api_client_admin.get(
            f"/api/v1/reports/export-expense-category-detail-pdf/?month=2024-02&category_id={category.id}"
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert (
            f'attachment; filename="2024-02_expense_category_{category.id}_detail_report.pdf"'
            == response["Content-Disposition"]
        )
        assert response.content.startswith(b"%PDF")

    def test_export_uncategorized_expense_category_detail_pdf_returns_attachment(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=None,
            account='CASH',
            amount=Decimal("90.00"),
            spent_at="2024-02-16",
            comment="Uncategorized expense detail export row",
            created_by=admin_user,
        )

        response = api_client_admin.get(
            "/api/v1/reports/export-expense-category-detail-pdf/?month=2024-02&category_id=null"
        )

        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert (
            'attachment; filename="2024-02_expense_category_uncategorized_detail_report.pdf"'
            == response["Content-Disposition"]
        )
        assert response.content.startswith(b"%PDF")

    def test_export_expense_category_detail_pdf_with_date_range_filters_rows(
        self,
        api_client_admin,
        admin_user,
        month_period_open,
    ):
        category = ExpenseCategory.objects.create(
            name="Expense range category",
            scope="office",
            kind="EXPENSE",
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='BANK',
            amount=Decimal("100.00"),
            spent_at="2024-02-05",
            comment="out",
            created_by=admin_user,
        )
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=category,
            account='BANK',
            amount=Decimal("40.00"),
            spent_at="2024-02-21",
            comment="in",
            created_by=admin_user,
        )

        response = api_client_admin.get(
            f"/api/v1/reports/export-expense-category-detail-pdf/?month=2024-02&category_id={category.id}&start_date=2024-02-20&end_date=2024-02-28&account=BANK"
        )
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"

        detail_data = dashboard_service.build_expense_category_detail_pdf_data(
            month="2024-02",
            month_period=month_period_open,
            category_id=category.id,
            is_uncategorized=False,
            account="BANK",
            start_date=date(2024, 2, 20),
            end_date=date(2024, 2, 28),
        )
        assert detail_data["total_count"] == 1
        assert detail_data["total_amount"] == "40.00"
        assert detail_data["period_label"] == "2024-02-20 — 2024-02-28"

    def test_export_expense_category_detail_pdf_invalid_date_range_returns_400(
        self,
        api_client_admin,
        month_period_open,
    ):
        response = api_client_admin.get(
            "/api/v1/reports/export-expense-category-detail-pdf/?month=2024-02&category_id=null&start_date=2024-02-10&end_date=2024-02-01"
        )
        assert response.status_code == 400

