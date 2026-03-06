"""
Tests for dashboard income sources endpoint.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import MonthPeriod
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.finance.models import FinancePeriod, IncomeEntry, IncomePlan, IncomeSource


User = get_user_model()


@pytest.fixture
def admin_user(db):
  return User.objects.create_user(
      username='admin_income_sources',
      email='admin_income_sources@test.com',
      password='testpass123',
      role='admin',
  )


@pytest.fixture
def director_user(db):
  return User.objects.create_user(
      username='director_income_sources',
      email='director_income_sources@test.com',
      password='testpass123',
      role='director',
  )


@pytest.fixture
def foreman_user(db):
  return User.objects.create_user(
      username='foreman_income_sources',
      email='foreman_income_sources@test.com',
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
def finance_period_office(month_period_open, db):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind='office',
      status='open',
  )


@pytest.fixture
def finance_period_charity(month_period_open, db):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind='charity',
      status='open',
  )


@pytest.fixture
def income_sources(db):
  source_a = IncomeSource.objects.create(name="Source A")
  source_b = IncomeSource.objects.create(name="Source B")
  source_plan_only = IncomeSource.objects.create(name="Source Plan Only")
  source_fact_only = IncomeSource.objects.create(name="Source Fact Only")
  return {
      "source_a": source_a,
      "source_b": source_b,
      "source_plan_only": source_plan_only,
      "source_fact_only": source_fact_only,
  }


class TestDashboardIncomeSourcesAPI:
  """Tests for /api/v1/reports/dashboard-income-sources/ endpoint."""

  def test_missing_month_period_returns_400_and_does_not_create_monthperiod(
      self,
      api_client_admin,
      db,
  ):
    month_value = "2099-11"
    assert MonthPeriod.objects.filter(month=month_value).count() == 0

    response = api_client_admin.get(
        f"/api/v1/reports/dashboard-income-sources/?month={month_value}"
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
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert resp_admin.status_code != 403

    # Director can access
    resp_director = api_client_director.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert resp_director.status_code != 403

    # Foreman is forbidden
    resp_foreman = api_client_foreman.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert resp_foreman.status_code == 403

  def test_sums_and_diff_by_source_across_all_fund_kinds(
      self,
      api_client_admin,
      month_period_open,
      finance_period_office,
      finance_period_charity,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    source_b = income_sources["source_b"]

    # Plans across different fund_kinds for the same MonthPeriod
    IncomePlan.objects.create(
        period=finance_period_office,
        source=source_a,
        amount=Decimal("100.00"),
    )
    IncomePlan.objects.create(
        period=finance_period_charity,
        source=source_b,
        amount=Decimal("300.00"),
    )

    # Income entries (facts) across different fund_kinds
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        amount=Decimal("80.00"),
        received_at="2024-02-05",
        comment="Office income 1",
        created_by=None,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        amount=Decimal("20.00"),
        received_at="2024-02-06",
        comment="Office income 2",
        created_by=None,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_charity,
        source=source_b,
        amount=Decimal("500.00"),
        received_at="2024-02-07",
        comment="Charity income 1",
        created_by=None,
    )

    # Uncategorized income (no source, no plan)
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=None,
        amount=Decimal("50.00"),
        received_at="2024-02-08",
        comment="Uncategorized income",
        created_by=None,
    )

    response = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert response.status_code == 200
    data = response.data

    # Totals: plan = 100 + 300 = 400; fact = 100 + 500 + 50 = 650
    assert Decimal(data["totals"]["plan"]) == Decimal("400.00")
    assert Decimal(data["totals"]["fact"]) == Decimal("650.00")

    rows_by_sid = {row["source_id"]: row for row in data["rows"]}

    # Source A
    row_a = rows_by_sid[source_a.id]
    assert Decimal(row_a["plan"]) == Decimal("100.00")
    assert Decimal(row_a["fact"]) == Decimal("100.00")
    assert Decimal(row_a["diff"]) == Decimal("0.00")
    assert row_a["count"] == 2

    # Source B
    row_b = rows_by_sid[source_b.id]
    assert Decimal(row_b["plan"]) == Decimal("300.00")
    assert Decimal(row_b["fact"]) == Decimal("500.00")
    assert Decimal(row_b["diff"]) == Decimal("200.00")
    assert row_b["count"] == 1

    # Uncategorized row (source_id is None), plan should be 0 and diff == fact
    row_uncat = rows_by_sid[None]
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

  def test_plan_only_and_fact_only_sources(
      self,
      api_client_admin,
      month_period_open,
      finance_period_office,
      finance_period_charity,
      income_sources,
  ):
    source_plan_only = income_sources["source_plan_only"]
    source_fact_only = income_sources["source_fact_only"]

    # Plan-only source
    IncomePlan.objects.create(
        period=finance_period_office,
        source=source_plan_only,
        amount=Decimal("150.00"),
    )

    # Fact-only source
    IncomeEntry.objects.create(
        finance_period=finance_period_charity,
        source=source_fact_only,
        amount=Decimal("220.00"),
        received_at="2024-02-09",
        comment="Fact only income",
        created_by=None,
    )

    response = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert response.status_code == 200
    data = response.data
    rows_by_sid = {row["source_id"]: row for row in data["rows"]}

    row_plan_only = rows_by_sid[source_plan_only.id]
    assert Decimal(row_plan_only["plan"]) == Decimal("150.00")
    assert Decimal(row_plan_only["fact"]) == Decimal("0.00")
    assert Decimal(row_plan_only["diff"]) == Decimal("-150.00")
    assert row_plan_only["count"] == 0

    row_fact_only = rows_by_sid[source_fact_only.id]
    assert Decimal(row_fact_only["plan"]) == Decimal("0.00")
    assert Decimal(row_fact_only["fact"]) == Decimal("220.00")
    assert Decimal(row_fact_only["diff"]) == Decimal("220.00")
    assert row_fact_only["count"] == 1

  def test_share_percent_and_zero_total_fact_behaviour(
      self,
      api_client_admin,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]

    # Case 1: with facts -> sharePercent should be a number
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        amount=Decimal("100.00"),
        received_at="2024-02-10",
        comment="Income with share",
        created_by=None,
    )

    response = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02"
    )
    assert response.status_code == 200
    data = response.data
    rows_by_sid = {row["source_id"]: row for row in data["rows"]}

    row_a = rows_by_sid[source_a.id]
    # Only one fact row, so sharePercent should be ~100
    assert row_a["sharePercent"] == pytest.approx(100.0)

    # Case 2: MonthPeriod exists but no data -> zero totals, no rows, sharePercent effectively None
    MonthPeriod.objects.create(month="2024-03", status="OPEN")
    response_empty = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-03"
    )
    assert response_empty.status_code == 200
    data_empty = response_empty.data
    assert data_empty["rows"] == []
    assert data_empty["totals"]["plan"] == "0.00"
    assert data_empty["totals"]["fact"] == "0.00"

