"""
Tests for dashboard KPI endpoint.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import BudgetLine, BudgetPlan, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.finance.models import FinancePeriod, IncomeEntry, IncomePlan, IncomeSource


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
def finance_period_project(db, month_period_open, admin_user):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind="project",
      project=None,
      created_by=admin_user,
  )


class TestDashboardKpiAPI:
  """Tests for /api/v1/reports/dashboard-kpis/ endpoint."""

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
        amount=Decimal("1000.00"),
        received_at="2024-02-05",
        comment="Office income",
        created_by=finance_period_office.created_by,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_project,
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
        amount=Decimal("400.00"),
        spent_at="2024-02-12",
        comment="Office expense",
        created_by=finance_period_office.created_by,
    )
    ExpenseActualExpense.objects.create(
        month_period=month_period_open,
        scope="PROJECT",
        category=None,
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

