"""
Tests for dashboard KPI endpoint.
"""
import calendar
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetLine, BudgetPlan, ExpenseCategory, MonthPeriod
from apps.projects.models import Project
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.finance.models import FinancePeriod, IncomeEntry, IncomePlan, IncomeSource
from apps.planning.models import ActualExpense as PlanningActualExpense
from apps.expenses.services import get_balance_for_account


User = get_user_model()


@pytest.fixture
def admin_user(db):
  return User.objects.create_user(
      username='admin_kpi',
      email='admin_kpi@test.com',
      password='testpass123',
      role='admin',
  )


@pytest.fixture
def director_user(db):
  return User.objects.create_user(
      username='director_kpi',
      email='director_kpi@test.com',
      password='testpass123',
      role='director',
  )


@pytest.fixture
def foreman_user(db):
  return User.objects.create_user(
      username='foreman_kpi',
      email='foreman_kpi@test.com',
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


@pytest.fixture
def finance_period_office(db, month_period_open, admin_user):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind="office",
      project=None,
      created_by=admin_user,
  )


@pytest.fixture
def project_kpi(db, admin_user):
  return Project.objects.create(
      name="KPI Project",
      description="Project for dashboard KPI tests",
      status="active",
      created_by=admin_user,
  )


@pytest.fixture
def finance_period_project(db, month_period_open, admin_user, project_kpi):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind="project",
      project=project_kpi,
      created_by=admin_user,
  )


class TestDashboardKpiAPI:
  """Tests for /api/v1/reports/dashboard-kpis/ endpoint."""

  def _get_monthly(self, client: APIClient, month: str):
    response = client.get(f"/api/v1/reports/dashboard-kpis/?month={month}")
    assert response.status_code == 200
    return response.data

  def test_requires_month(self, api_client_admin):
    response = api_client_admin.get("/api/v1/reports/dashboard-kpis/")
    assert response.status_code == 400
    assert "month" in response.data
    assert "required" in response.data["month"].lower()

  def test_invalid_month_format(self, api_client_admin):
    response = api_client_admin.get(
        "/api/v1/reports/dashboard-kpis/?month=2024/02"
    )
    assert response.status_code == 400
    assert "month" in response.data
    assert "format" in response.data["month"].lower()

  def test_missing_month_period_returns_400_and_does_not_create_monthperiod(
      self, api_client_admin, db
  ):
    month_value = "2099-11"
    assert MonthPeriod.objects.filter(month=month_value).count() == 0

    response = api_client_admin.get(
        f"/api/v1/reports/dashboard-kpis/?month={month_value}"
    )

    assert response.status_code == 400
    assert response.data["month"] == MONTH_REQUIRED_MSG
    assert MonthPeriod.objects.filter(month=month_value).count() == 0

  def test_empty_data_returns_zeros(self, api_client_admin, month_period_open):
    response = api_client_admin.get(
        "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )
    assert response.status_code == 200
    data = response.data
    assert data["month"] == "2024-02"
    assert Decimal(data["income_fact"]) == Decimal("0.00")
    assert Decimal(data["expense_fact"]) == Decimal("0.00")
    assert Decimal(data["net"]) == Decimal("0.00")
    # When there are no plans, plan totals should also be zero
    assert Decimal(data["income_plan"]) == Decimal("0.00")
    assert Decimal(data["expense_plan"]) == Decimal("0.00")
    assert Decimal(data["net_plan"]) == Decimal("0.00")
    assert "cash_balance" in data
    assert "bank_balance" in data
    assert Decimal(data["cash_balance"]) == Decimal("0.00")
    assert Decimal(data["bank_balance"]) == Decimal("0.00")
    # New fields also exist and are zero
    assert Decimal(data["cash_opening_balance"]) == Decimal("0.00")
    assert Decimal(data["bank_opening_balance"]) == Decimal("0.00")
    assert Decimal(data["cash_inflow_month"]) == Decimal("0.00")
    assert Decimal(data["cash_outflow_month"]) == Decimal("0.00")
    assert Decimal(data["bank_inflow_month"]) == Decimal("0.00")
    assert Decimal(data["bank_outflow_month"]) == Decimal("0.00")
    assert Decimal(data["cash_closing_balance"]) == Decimal("0.00")
    assert Decimal(data["bank_closing_balance"]) == Decimal("0.00")
    assert Decimal(data["planning_actual_expense_total"]) == Decimal("0.00")

  def test_aggregates_income_and_expenses_across_scopes(
      self,
      api_client_admin,
      month_period_open,
      finance_period_office,
      finance_period_project,
  ):
    # Income entries across multiple fund_kinds and projects
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        account='CASH',
        amount=Decimal("1000.00"),
        received_at="2024-02-05",
        comment="Office income",
        created_by=finance_period_office.created_by,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_project,
        account='CASH',
        amount=Decimal("500.00"),
        received_at="2024-02-10",
        comment="Project income",
        created_by=finance_period_project.created_by,
    )

    # Expenses across multiple scopes
    ExpenseActualExpense.objects.create(
        month_period=month_period_open,
        scope="OFFICE",
        category=None,
        account='CASH',
        amount=Decimal("400.00"),
        spent_at="2024-02-12",
        comment="Office expense",
        created_by=finance_period_office.created_by,
    )
    ExpenseActualExpense.objects.create(
        month_period=month_period_open,
        scope="PROJECT",
        category=None,
        account='CASH',
        amount=Decimal("300.00"),
        spent_at="2024-02-15",
        comment="Project expense",
        created_by=finance_period_office.created_by,
    )

    response = api_client_admin.get(
        "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )

    assert response.status_code == 200
    data = response.data
    # Income fact: 1000 + 500 = 1500
    assert Decimal(data["income_fact"]) == Decimal("1500.00")
    # Expense fact: 400 + 300 = 700
    assert Decimal(data["expense_fact"]) == Decimal("700.00")
    # Net: 1500 - 700 = 800
    assert Decimal(data["net"]) == Decimal("800.00")
    # Cash balance: income to CASH 1500 - expense from CASH 700 = 800; bank = 0
    assert Decimal(data["cash_balance"]) == Decimal("800.00")
    assert Decimal(data["bank_balance"]) == Decimal("0.00")

    # Closing balances equal cash_balance/bank_balance
    assert Decimal(data["cash_closing_balance"]) == Decimal("800.00")
    assert Decimal(data["bank_closing_balance"]) == Decimal("0.00")

  def test_opening_and_closing_relationship_across_months(
      self,
      api_client_admin,
      db,
  ):
    # Create March and April MonthPeriods
    month_period_march = MonthPeriod.objects.create(month="2024-03", status="OPEN")
    month_period_april = MonthPeriod.objects.create(month="2024-04", status="OPEN")

    # Single finance period reused
    admin_user = User.objects.get(username="admin_kpi")
    fp_march = FinancePeriod.objects.create(
      month_period=month_period_march,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )
    fp_april = FinancePeriod.objects.create(
      month_period=month_period_april,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )

    # March: income 1000 to CASH, expense 200 from CASH
    IncomeEntry.objects.create(
      finance_period=fp_march,
      account="CASH",
      amount=Decimal("1000.00"),
      received_at="2024-03-10",
      comment="March income",
      created_by=fp_march.created_by,
    )
    ExpenseActualExpense.objects.create(
      month_period=month_period_march,
      scope="OFFICE",
      category=None,
      account="CASH",
      amount=Decimal("200.00"),
      spent_at="2024-03-15",
      comment="March expense",
      created_by=fp_march.created_by,
    )

    data_march = self._get_monthly(api_client_admin, "2024-03")

    # April: income 300 to CASH, expense 100 from CASH
    IncomeEntry.objects.create(
      finance_period=fp_april,
      account="CASH",
      amount=Decimal("300.00"),
      received_at="2024-04-05",
      comment="April income",
      created_by=fp_april.created_by,
    )
    ExpenseActualExpense.objects.create(
      month_period=month_period_april,
      scope="OFFICE",
      category=None,
      account="CASH",
      amount=Decimal("100.00"),
      spent_at="2024-04-07",
      comment="April expense",
      created_by=fp_april.created_by,
    )

    data_april = self._get_monthly(api_client_admin, "2024-04")

    # 1) Opening of April equals closing of March
    assert Decimal(data_april["cash_opening_balance"]) == Decimal(data_march["cash_closing_balance"])
    assert Decimal(data_april["bank_opening_balance"]) == Decimal(data_march["bank_closing_balance"])

    # 2) closing = opening + inflow - outflow for CASH
    open_c = Decimal(data_april["cash_opening_balance"])
    inflow_c = Decimal(data_april["cash_inflow_month"])
    outflow_c = Decimal(data_april["cash_outflow_month"])
    close_c = Decimal(data_april["cash_closing_balance"])
    assert close_c == open_c + inflow_c - outflow_c

    # BANK has no movements
    open_b = Decimal(data_april["bank_opening_balance"])
    inflow_b = Decimal(data_april["bank_inflow_month"])
    outflow_b = Decimal(data_april["bank_outflow_month"])
    close_b = Decimal(data_april["bank_closing_balance"])
    assert close_b == open_b + inflow_b - outflow_b

  def test_first_month_opening_zero_without_prior_data(self, api_client_admin, db):
    # Only create MonthPeriod and movements for one month (2024-01)
    mp_jan = MonthPeriod.objects.create(month="2024-01", status="OPEN")
    admin_user = User.objects.get(username="admin_kpi")
    fp_jan = FinancePeriod.objects.create(
      month_period=mp_jan,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )

    IncomeEntry.objects.create(
      finance_period=fp_jan,
      account="CASH",
      amount=Decimal("500.00"),
      received_at="2024-01-05",
      comment="January income",
      created_by=fp_jan.created_by,
    )

    data = self._get_monthly(api_client_admin, "2024-01")
    assert Decimal(data["cash_opening_balance"]) == Decimal("0.00")
    assert Decimal(data["bank_opening_balance"]) == Decimal("0.00")

  def test_backdated_movement_updates_future_opening_and_closing(
      self,
      api_client_admin,
      db,
  ):
    month_period_march = MonthPeriod.objects.create(month="2024-03", status="OPEN")
    month_period_april = MonthPeriod.objects.create(month="2024-04", status="OPEN")
    admin_user = User.objects.get(username="admin_kpi")
    fp_march = FinancePeriod.objects.create(
      month_period=month_period_march,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )
    fp_april = FinancePeriod.objects.create(
      month_period=month_period_april,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )

    # Initial March and April income to CASH
    IncomeEntry.objects.create(
      finance_period=fp_march,
      account="CASH",
      amount=Decimal("1000.00"),
      received_at="2024-03-10",
      comment="March income",
      created_by=fp_march.created_by,
    )
    IncomeEntry.objects.create(
      finance_period=fp_april,
      account="CASH",
      amount=Decimal("200.00"),
      received_at="2024-04-10",
      comment="April income",
      created_by=fp_april.created_by,
    )

    data_april_before = self._get_monthly(api_client_admin, "2024-04")
    cash_open_before = Decimal(data_april_before["cash_opening_balance"])
    cash_close_before = Decimal(data_april_before["cash_closing_balance"])

    # Add backdated March expense
    ExpenseActualExpense.objects.create(
      month_period=month_period_march,
      scope="OFFICE",
      category=None,
      account="CASH",
      amount=Decimal("150.00"),
      spent_at="2024-03-20",
      comment="Backdated March expense",
      created_by=fp_march.created_by,
    )

    data_april_after = self._get_monthly(api_client_admin, "2024-04")
    cash_open_after = Decimal(data_april_after["cash_opening_balance"])
    cash_close_after = Decimal(data_april_after["cash_closing_balance"])

    # Opening and closing should both be reduced by 150 compared to before
    assert cash_open_after == cash_open_before - Decimal("150.00")
    assert cash_close_after == cash_close_before - Decimal("150.00")

  def test_transfer_affects_flows_and_balances_but_not_net(
      self,
      api_client_admin,
      db,
  ):
    month_period = MonthPeriod.objects.create(month="2024-05", status="OPEN")
    admin_user = User.objects.get(username="admin_kpi")
    fp_may = FinancePeriod.objects.create(
      month_period=month_period,
      fund_kind="office",
      project=None,
      created_by=admin_user,
    )

    # Income 1000 to CASH
    IncomeEntry.objects.create(
      finance_period=fp_may,
      account="CASH",
      amount=Decimal("1000.00"),
      received_at="2024-05-05",
      comment="May income",
      created_by=fp_may.created_by,
    )

    # Transfer 400 from CASH to BANK
    from apps.finance.models import Transfer
    Transfer.objects.create(
      source_account="CASH",
      destination_account="BANK",
      amount=Decimal("400.00"),
      transferred_at="2024-05-10",
      comment="Internal transfer",
      created_by=admin_user,
    )

    data = self._get_monthly(api_client_admin, "2024-05")

    # Transfers must not affect income_fact / expense_fact / net
    assert Decimal(data["income_fact"]) == Decimal("1000.00")
    assert Decimal(data["expense_fact"]) == Decimal("0.00")
    assert Decimal(data["net"]) == Decimal("1000.00")

    # Transfers must affect inflow/outflow and balances
    inflow_c = Decimal(data["cash_inflow_month"])
    outflow_c = Decimal(data["cash_outflow_month"])
    inflow_b = Decimal(data["bank_inflow_month"])
    outflow_b = Decimal(data["bank_outflow_month"])

    assert inflow_c == Decimal("1000.00")
    assert outflow_c == Decimal("400.00")
    assert inflow_b == Decimal("400.00")
    assert outflow_b == Decimal("0.00")

  def test_permissions_only_admin_and_director(
      self, api_client_admin, api_client_director, api_client_foreman, month_period_open
  ):
    # Admin can access
    resp_admin = api_client_admin.get(
        "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )
    assert resp_admin.status_code != 403

    # Director can access
    resp_director = api_client_director.get(
        "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )
    assert resp_director.status_code != 403

    # Foreman is forbidden
    resp_foreman = api_client_foreman.get(
        "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )
    assert resp_foreman.status_code == 403

  def test_plan_totals_sum_across_scopes(
      self,
      api_client_admin,
      month_period_open,
      finance_period_office,
      finance_period_project,
  ):
    """Income and expense plans across all scopes are summed into plan totals."""
    # Additional finance period for charity fund_kind sharing same MonthPeriod
    finance_period_charity = FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind="charity",
      project=None,
      created_by=finance_period_office.created_by,
    )

    # Income plan sources
    source_office = IncomeSource.objects.create(name="Office source")
    source_project = IncomeSource.objects.create(name="Project source")
    source_charity = IncomeSource.objects.create(name="Charity source")

    # Income plans across different fund_kinds (office, project, charity)
    IncomePlan.objects.create(
      period=finance_period_office,
      source=source_office,
      amount=Decimal("100.00"),
    )
    IncomePlan.objects.create(
      period=finance_period_project,
      source=source_project,
      amount=Decimal("200.00"),
    )
    IncomePlan.objects.create(
      period=finance_period_charity,
      source=source_charity,
      amount=Decimal("300.00"),
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
    plan_charity = BudgetPlan.objects.create(
      period=month_period_open,
      scope="CHARITY",
    )

    # Categories (minimal fields)
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
    cat_charity = ExpenseCategory.objects.create(
      name="Charity category",
      scope="charity",
      kind="EXPENSE",
    )

    # Budget lines across all scopes
    BudgetLine.objects.create(
      plan=plan_office,
      category=cat_office,
      amount_planned=Decimal("400.00"),
    )
    BudgetLine.objects.create(
      plan=plan_project,
      category=cat_project,
      amount_planned=Decimal("50.00"),
    )
    BudgetLine.objects.create(
      plan=plan_charity,
      category=cat_charity,
      amount_planned=Decimal("50.00"),
    )

    response = api_client_admin.get(
      "/api/v1/reports/dashboard-kpis/?month=2024-02"
    )

    assert response.status_code == 200
    data = response.data

    # Income plan: 100 + 200 + 300 = 600
    assert Decimal(data["income_plan"]) == Decimal("600.00")
    # Expense plan: 400 + 50 + 50 = 500
    assert Decimal(data["expense_plan"]) == Decimal("500.00")
    # Net plan: 600 - 500 = 100
    assert Decimal(data["net_plan"]) == Decimal("100.00")


class TestDashboardKpiPlanningVsExpenseActualSemantics:
    """planning.ActualExpense is exposed separately; expense_fact matches expenses app only."""

    def test_expense_fact_and_net_use_only_expense_app_actuals(
        self,
        api_client_admin,
        month_period_open,
        finance_period_office,
    ):
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=None,
            account="CASH",
            amount=Decimal("100.00"),
            spent_at="2024-02-01",
            comment="cash expense",
            created_by=finance_period_office.created_by,
        )
        PlanningActualExpense.objects.create(
            finance_period=finance_period_office,
            name="Planning spend",
            amount=Decimal("999.00"),
            spent_at="2024-02-02",
            comment="synced planning",
            created_by=finance_period_office.created_by,
        )

        r = api_client_admin.get("/api/v1/reports/dashboard-kpis/?month=2024-02")
        assert r.status_code == 200
        d = r.data
        assert Decimal(d["expense_fact"]) == Decimal("100.00")
        assert Decimal(d["planning_actual_expense_total"]) == Decimal("999.00")
        assert Decimal(d["net"]) == Decimal("-100.00")

    def test_planning_only_month_shows_zero_expense_fact_nonzero_planning_field(
        self,
        api_client_admin,
        month_period_open,
        finance_period_office,
    ):
        PlanningActualExpense.objects.create(
            finance_period=finance_period_office,
            name="Only planning",
            amount=Decimal("50.00"),
            spent_at="2024-02-10",
            comment="c",
            created_by=finance_period_office.created_by,
        )
        r = api_client_admin.get("/api/v1/reports/dashboard-kpis/?month=2024-02")
        assert r.status_code == 200
        d = r.data
        assert Decimal(d["expense_fact"]) == Decimal("0.00")
        assert Decimal(d["planning_actual_expense_total"]) == Decimal("50.00")
        assert Decimal(d["net"]) == Decimal("0.00")

    def test_get_balance_for_account_ignores_planning_actual_expense(
        self,
        month_period_open,
        finance_period_office,
    ):
        """Balance helper uses only apps.expenses.ActualExpense; planning rows do not debit CASH/BANK."""
        ExpenseActualExpense.objects.create(
            month_period=month_period_open,
            scope="OFFICE",
            category=None,
            account="CASH",
            amount=Decimal("75.00"),
            spent_at="2024-02-14",
            comment="e",
            created_by=finance_period_office.created_by,
        )
        PlanningActualExpense.objects.create(
            finance_period=finance_period_office,
            name="Planning",
            amount=Decimal("999.00"),
            spent_at="2024-02-15",
            comment="p",
            created_by=finance_period_office.created_by,
        )
        last = date(2024, 2, calendar.monthrange(2024, 2)[1])
        bal = get_balance_for_account("CASH", last)
        assert bal == Decimal("-75.00")

