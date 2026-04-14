from datetime import date
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import MonthPeriod
from apps.expenses.models import ActualExpense
from apps.finance.models import FinancePeriod, IncomeEntry, Transfer
from apps.reports.services.cash_movement import build_cash_movement_data
from apps.reports.services.pdf import build_cash_movement_pdf


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin_cash_movement",
        email="admin_cash_movement@test.com",
        password="testpass123",
        role="admin",
    )


@pytest.fixture
def foreman_user(db):
    return User.objects.create_user(
        username="foreman_cash_movement",
        email="foreman_cash_movement@test.com",
        password="testpass123",
        role="foreman",
    )


@pytest.fixture
def api_client_admin(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def api_client_foreman(foreman_user):
    client = APIClient()
    client.force_authenticate(user=foreman_user)
    return client


@pytest.fixture
def month_period_jan(db):
    return MonthPeriod.objects.create(month="2024-01", status="OPEN")


@pytest.fixture
def month_period_feb(db):
    return MonthPeriod.objects.create(month="2024-02", status="OPEN")


@pytest.fixture
def finance_period(month_period_feb, admin_user):
    return FinancePeriod.objects.create(
        month_period=month_period_feb,
        fund_kind="office",
        created_by=admin_user,
    )


class TestCashMovementPdf:
    def test_cash_movement_pdf_contains_required_statement_labels_and_formula(self):
        data = {
            "opening_balance": Decimal("100.00"),
            "period_income": Decimal("50.00"),
            "period_expense": Decimal("20.00"),
            "transfer_in": Decimal("10.00"),
            "transfer_out": Decimal("5.00"),
            "closing_balance": Decimal("135.00"),
        }
        filters = {
            "account": "CASH",
            "start_date": date(2024, 2, 1),
            "end_date": date(2024, 2, 29),
        }
        pdf_content = build_cash_movement_pdf(data, filters)

        assert pdf_content.startswith(b"%PDF")
        assert isinstance(pdf_content, bytes)
        assert len(pdf_content) > 0

    def test_pdf_returns_attachment_for_valid_params(self, api_client_admin):
        response = api_client_admin.get(
            "/api/v1/reports/cash-movement-pdf/?account=CASH&start_date=2024-02-01&end_date=2024-02-29"
        )
        assert response.status_code == 200
        assert response["Content-Type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")

    def test_permission_denied_for_foreman(self, api_client_foreman):
        response = api_client_foreman.get(
            "/api/v1/reports/cash-movement-pdf/?account=CASH&start_date=2024-02-01&end_date=2024-02-29"
        )
        assert response.status_code == 403

    def test_invalid_params_return_400(self, api_client_admin):
        invalid_account = api_client_admin.get(
            "/api/v1/reports/cash-movement-pdf/?account=INVALID&start_date=2024-02-01&end_date=2024-02-29"
        )
        assert invalid_account.status_code == 400
        assert "account" in invalid_account.data

        missing_range = api_client_admin.get(
            "/api/v1/reports/cash-movement-pdf/?account=CASH"
        )
        assert missing_range.status_code == 400

        invalid_order = api_client_admin.get(
            "/api/v1/reports/cash-movement-pdf/?account=CASH&start_date=2024-02-20&end_date=2024-02-01"
        )
        assert invalid_order.status_code == 400

    def test_math_opening_income_expense_transfer_equals_closing(
        self, admin_user, month_period_jan, finance_period
    ):
        # Opening seed before range
        fp_jan = FinancePeriod.objects.create(
            month_period=month_period_jan,
            fund_kind="office",
            created_by=admin_user,
        )
        IncomeEntry.objects.create(
            finance_period=fp_jan,
            source=None,
            account="CASH",
            amount=Decimal("100.00"),
            received_at="2024-01-20",
            comment="seed",
            created_by=admin_user,
        )

        # In range flows for CASH
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=None,
            account="CASH",
            amount=Decimal("50.00"),
            received_at="2024-02-05",
            comment="income",
            created_by=admin_user,
        )
        ActualExpense.objects.create(
            month_period=finance_period.month_period,
            scope="OFFICE",
            category=None,
            account="CASH",
            amount=Decimal("20.00"),
            spent_at="2024-02-07",
            comment="expense",
            created_by=admin_user,
        )
        Transfer.objects.create(
            source_account="BANK",
            destination_account="CASH",
            amount=Decimal("10.00"),
            transferred_at="2024-02-10",
            comment="in",
            created_by=admin_user,
        )
        Transfer.objects.create(
            source_account="CASH",
            destination_account="BANK",
            amount=Decimal("4.00"),
            transferred_at="2024-02-11",
            comment="out",
            created_by=admin_user,
        )

        data = build_cash_movement_data(
            account="CASH",
            start_date=date(2024, 2, 1),
            end_date=date(2024, 2, 29),
        )
        computed = (
            data["opening_balance"]
            + data["period_income"]
            - data["period_expense"]
            + data["transfer_in"]
            - data["transfer_out"]
        )
        assert computed == data["closing_balance"]

    @pytest.mark.django_db
    def test_empty_period_returns_zeros(self):
        data = build_cash_movement_data(
            account="BANK",
            start_date=date(2024, 2, 1),
            end_date=date(2024, 2, 29),
        )
        assert data["period_income"] == Decimal("0.00")
        assert data["period_expense"] == Decimal("0.00")
        assert data["transfer_in"] == Decimal("0.00")
        assert data["transfer_out"] == Decimal("0.00")
        assert data["opening_balance"] == Decimal("0.00")
        assert data["closing_balance"] == Decimal("0.00")

    def test_only_income(self, finance_period, admin_user):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            source=None,
            account="BANK",
            amount=Decimal("77.00"),
            received_at="2024-02-12",
            comment="income only",
            created_by=admin_user,
        )
        data = build_cash_movement_data(
            account="BANK",
            start_date=date(2024, 2, 1),
            end_date=date(2024, 2, 29),
        )
        assert data["period_income"] == Decimal("77.00")
        assert data["period_expense"] == Decimal("0.00")
        assert data["transfer_in"] == Decimal("0.00")
        assert data["transfer_out"] == Decimal("0.00")

    def test_only_expense(self, month_period_feb, admin_user):
        ActualExpense.objects.create(
            month_period=month_period_feb,
            scope="OFFICE",
            category=None,
            account="CASH",
            amount=Decimal("12.00"),
            spent_at="2024-02-14",
            comment="expense only",
            created_by=admin_user,
        )
        data = build_cash_movement_data(
            account="CASH",
            start_date=date(2024, 2, 1),
            end_date=date(2024, 2, 29),
        )
        assert data["period_income"] == Decimal("0.00")
        assert data["period_expense"] == Decimal("12.00")
        assert data["transfer_in"] == Decimal("0.00")
        assert data["transfer_out"] == Decimal("0.00")

    def test_only_transfers(self, admin_user):
        Transfer.objects.create(
            source_account="BANK",
            destination_account="CASH",
            amount=Decimal("30.00"),
            transferred_at="2024-02-15",
            comment="in",
            created_by=admin_user,
        )
        Transfer.objects.create(
            source_account="CASH",
            destination_account="BANK",
            amount=Decimal("5.00"),
            transferred_at="2024-02-16",
            comment="out",
            created_by=admin_user,
        )
        data = build_cash_movement_data(
            account="CASH",
            start_date=date(2024, 2, 1),
            end_date=date(2024, 2, 29),
        )
        assert data["period_income"] == Decimal("0.00")
        assert data["period_expense"] == Decimal("0.00")
        assert data["transfer_in"] == Decimal("30.00")
        assert data["transfer_out"] == Decimal("5.00")
