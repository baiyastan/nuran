"""
Tests for dashboard income sources endpoint.
"""
from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import MonthPeriod
from apps.finance.constants import MONTH_REQUIRED_MSG
from apps.finance.models import FinancePeriod, IncomeEntry, IncomePlan, IncomeSource
from apps.reports.services import dashboard as dashboard_service


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
def finance_period_office(month_period_open, admin_user, db):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind='office',
      status='open',
      created_by=admin_user,
  )


@pytest.fixture
def finance_period_charity(month_period_open, admin_user, db):
  return FinancePeriod.objects.create(
      month_period=month_period_open,
      fund_kind='charity',
      status='open',
      created_by=admin_user,
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
      admin_user,
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
        account='CASH',
        amount=Decimal("80.00"),
        received_at="2024-02-05",
        comment="Office income 1",
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("20.00"),
        received_at="2024-02-06",
        comment="Office income 2",
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_charity,
        source=source_b,
        account='CASH',
        amount=Decimal("500.00"),
        received_at="2024-02-07",
        comment="Charity income 1",
        created_by=admin_user,
    )

    # Uncategorized income (no source, no plan)
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=None,
        account='CASH',
        amount=Decimal("50.00"),
        received_at="2024-02-08",
        comment="Uncategorized income",
        created_by=admin_user,
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
      admin_user,
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
        account='CASH',
        amount=Decimal("220.00"),
        received_at="2024-02-09",
        comment="Fact only income",
        created_by=admin_user,
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
      admin_user,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]

    # Case 1: with facts -> sharePercent should be a number
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("100.00"),
        received_at="2024-02-10",
        comment="Income with share",
        created_by=admin_user,
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

  def test_date_range_narrows_fact_only_and_shape_unchanged(
      self,
      api_client_admin,
      admin_user,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    IncomePlan.objects.create(
        period=finance_period_office,
        source=source_a,
        amount=Decimal("400.00"),
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("100.00"),
        received_at="2024-02-02",
        comment="out of range",
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("70.00"),
        received_at="2024-02-21",
        comment="in range",
        created_by=admin_user,
    )

    no_range = api_client_admin.get("/api/v1/reports/dashboard-income-sources/?month=2024-02")
    with_range = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02&start_date=2024-02-15&end_date=2024-02-28"
    )
    assert no_range.status_code == 200
    assert with_range.status_code == 200
    assert Decimal(no_range.data["totals"]["fact"]) == Decimal("170.00")
    assert Decimal(with_range.data["totals"]["fact"]) == Decimal("70.00")
    assert Decimal(with_range.data["totals"]["plan"]) == Decimal("400.00")
    row = with_range.data["rows"][0]
    assert set(row.keys()) == {"source_id", "source_name", "plan", "fact", "diff", "count", "sharePercent"}

  def test_date_range_validation_errors_return_400(self, api_client_admin, month_period_open):
    only_end = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02&end_date=2024-02-10"
    )
    invalid_order = api_client_admin.get(
        "/api/v1/reports/dashboard-income-sources/?month=2024-02&start_date=2024-02-20&end_date=2024-02-10"
    )
    assert only_end.status_code == 400
    assert invalid_order.status_code == 400

  def test_export_income_sources_pdf_returns_attachment(
      self,
      api_client_admin,
      admin_user,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    IncomePlan.objects.create(
        period=finance_period_office,
        source=source_a,
        amount=Decimal("125.00"),
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("200.00"),
        received_at="2024-02-12",
        comment="Income export row",
        created_by=admin_user,
    )

    response = api_client_admin.get(
        "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=income_sources"
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert 'attachment; filename="2024-02_income_sources_report.pdf"' == response["Content-Disposition"]
    assert response.content.startswith(b"%PDF")

  def test_export_section_pdf_accepts_range_and_account_filters(
      self,
      api_client_admin,
      admin_user,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    IncomePlan.objects.create(period=finance_period_office, source=source_a, amount=Decimal("300.00"))
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='BANK',
        amount=Decimal("120.00"),
        received_at="2024-02-08",
        comment="inside",
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("80.00"),
        received_at="2024-02-09",
        comment="outside by account",
        created_by=admin_user,
    )
    response = api_client_admin.get(
        "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=income_sources&start_date=2024-02-01&end_date=2024-02-15&account=BANK"
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"

    section_data = dashboard_service.build_dashboard_income_sources_data(
        "2024-02",
        month_period_open,
        account="BANK",
        start_date=date(2024, 2, 1),
        end_date=date(2024, 2, 15),
    )
    assert Decimal(section_data["totals"]["fact"]) == Decimal("120.00")

  def test_export_section_pdf_invalid_section_type_returns_400(
      self,
      api_client_admin,
      month_period_open,
  ):
    response = api_client_admin.get(
        "/api/v1/reports/export-section-pdf/?month=2024-02&section_type=unknown_section"
    )

    assert response.status_code == 400
    assert response.data["section_type"] == (
        "section_type must be one of: income_sources, expense_categories"
    )

  def test_export_income_source_detail_pdf_returns_attachment(
      self,
      api_client_admin,
      admin_user,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("200.00"),
        received_at="2024-02-12",
        comment="Income detail export row",
        created_by=admin_user,
    )

    response = api_client_admin.get(
        f"/api/v1/reports/export-income-source-detail-pdf/?month=2024-02&source_id={source_a.id}"
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert (
        f'attachment; filename="2024-02_income_source_{source_a.id}_detail_report.pdf"'
        == response["Content-Disposition"]
    )
    assert response.content.startswith(b"%PDF")

  def test_export_uncategorized_income_source_detail_pdf_returns_attachment(
      self,
      api_client_admin,
      admin_user,
      finance_period_office,
  ):
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=None,
        account='CASH',
        amount=Decimal("75.00"),
        received_at="2024-02-13",
        comment="Uncategorized income detail export row",
        created_by=admin_user,
    )

    response = api_client_admin.get(
        "/api/v1/reports/export-income-source-detail-pdf/?month=2024-02&source_id=null"
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"
    assert (
        'attachment; filename="2024-02_income_source_uncategorized_detail_report.pdf"'
        == response["Content-Disposition"]
    )
    assert response.content.startswith(b"%PDF")

  def test_export_income_source_detail_pdf_with_date_range_filters_rows(
      self,
      api_client_admin,
      admin_user,
      month_period_open,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("100.00"),
        received_at="2024-02-05",
        comment="out",
        created_by=admin_user,
    )
    IncomeEntry.objects.create(
        finance_period=finance_period_office,
        source=source_a,
        account='CASH',
        amount=Decimal("50.00"),
        received_at="2024-02-20",
        comment="in",
        created_by=admin_user,
    )

    response = api_client_admin.get(
        f"/api/v1/reports/export-income-source-detail-pdf/?month=2024-02&source_id={source_a.id}&start_date=2024-02-15&end_date=2024-02-28&account=CASH"
    )
    assert response.status_code == 200
    assert response["Content-Type"] == "application/pdf"

    detail_data = dashboard_service.build_income_source_detail_pdf_data(
        month="2024-02",
        month_period=month_period_open,
        source_id=source_a.id,
        is_uncategorized=False,
        account="CASH",
        start_date=date(2024, 2, 15),
        end_date=date(2024, 2, 28),
    )
    assert detail_data["total_count"] == 1
    assert detail_data["total_amount"] == "50.00"
    assert detail_data["period_label"] == "2024-02-15 — 2024-02-28"

  def test_export_income_source_detail_pdf_invalid_date_range_returns_400(
      self,
      api_client_admin,
      finance_period_office,
      income_sources,
  ):
    source_a = income_sources["source_a"]
    response = api_client_admin.get(
        f"/api/v1/reports/export-income-source-detail-pdf/?month=2024-02&source_id={source_a.id}&start_date=2024-02-20&end_date=2024-02-01"
    )
    assert response.status_code == 400

