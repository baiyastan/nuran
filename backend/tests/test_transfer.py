"""
Tests for Transfer API and accounting rules.
Transfer is NOT income, NOT expense; it only moves money between Cash and Bank.
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from apps.budgeting.models import MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.models import FinancePeriod, IncomeEntry, Transfer


User = get_user_model()


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username="admin_transfer",
        email="admin_transfer@test.com",
        password="testpass123",
        role="admin",
    )


@pytest.fixture
def api_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def month_period(db):
    return MonthPeriod.objects.create(month="2024-03", status="OPEN")


@pytest.fixture
def finance_period(db, month_period, admin_user):
    return FinancePeriod.objects.create(
        month_period=month_period,
        fund_kind="office",
        project=None,
        created_by=admin_user,
    )


class TestTransferValidation:
    """Validation: same source/dest, insufficient balance."""

    def test_same_source_and_destination_fails(self, api_client, month_period, finance_period):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("10000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        payload = {
            "source_account": "CASH",
            "destination_account": "CASH",
            "amount": "100.00",
            "transferred_at": "2024-03-15",
            "comment": "Same account",
        }
        response = api_client.post("/api/v1/transfers/", payload, format="json")
        assert response.status_code == 400
        assert "destination_account" in response.data or "source" in str(response.data).lower()

    def test_insufficient_source_balance_fails(self, api_client, month_period, finance_period):
        # No income to CASH; balance = 0. Transfer 500 from CASH should fail.
        payload = {
            "source_account": "CASH",
            "destination_account": "BANK",
            "amount": "500.00",
            "transferred_at": "2024-03-15",
            "comment": "Overdraft",
        }
        response = api_client.post("/api/v1/transfers/", payload, format="json")
        assert response.status_code == 400
        assert "amount" in response.data or "Insufficient" in str(response.data)

    def test_sufficient_balance_succeeds(self, api_client, month_period, finance_period):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("10000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        payload = {
            "source_account": "CASH",
            "destination_account": "BANK",
            "amount": "2000.00",
            "transferred_at": "2024-03-15",
            "comment": "To bank",
        }
        response = api_client.post("/api/v1/transfers/", payload, format="json")
        assert response.status_code == 201
        assert response.data["source_account"] == "CASH"
        assert response.data["destination_account"] == "BANK"
        assert Decimal(response.data["amount"]) == Decimal("2000.00")


class TestTransferNotIncomeOrExpense:
    """Transfer must not appear in income_fact or expense_fact; must not change profit."""

    def test_transfer_does_not_change_income_fact_or_expense_fact(
        self, api_client, month_period, finance_period
    ):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("5000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        # Create transfer via API
        api_client.post(
            "/api/v1/transfers/",
            {
                "source_account": "CASH",
                "destination_account": "BANK",
                "amount": "1000.00",
                "transferred_at": "2024-03-10",
                "comment": "Transfer",
            },
            format="json",
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        data = response.data
        # Income fact = only IncomeEntry, not transfer
        assert Decimal(data["income_fact"]) == Decimal("5000.00")
        assert Decimal(data["expense_fact"]) == Decimal("0.00")
        assert Decimal(data["net"]) == Decimal("5000.00")

    def test_transfer_does_not_appear_as_income(self, api_client, month_period, finance_period):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="BANK",
            amount=Decimal("3000.00"),
            received_at="2024-03-05",
            comment="Bank income",
            created_by=finance_period.created_by,
        )
        Transfer.objects.create(
            source_account="BANK",
            destination_account="CASH",
            amount=Decimal("500.00"),
            transferred_at="2024-03-15",
            comment="Withdraw",
            created_by=finance_period.created_by,
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        # income_fact = 3000 only (the IncomeEntry), not 3500
        assert Decimal(response.data["income_fact"]) == Decimal("3000.00")

    def test_transfer_does_not_appear_as_expense(self, api_client, month_period, finance_period):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("5000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        Transfer.objects.create(
            source_account="CASH",
            destination_account="BANK",
            amount=Decimal("1000.00"),
            transferred_at="2024-03-15",
            comment="Deposit",
            created_by=finance_period.created_by,
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        assert Decimal(response.data["expense_fact"]) == Decimal("0.00")


class TestTransferUpdatesBalances:
    """Cash and bank balances must include transfers correctly."""

    def test_transfer_cash_to_bank_updates_balances(
        self, api_client, month_period, finance_period
    ):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("50000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="BANK",
            amount=Decimal("10000.00"),
            received_at="2024-03-01",
            comment="Bank income",
            created_by=finance_period.created_by,
        )
        # Before transfer: cash=50000, bank=10000
        Transfer.objects.create(
            source_account="CASH",
            destination_account="BANK",
            amount=Decimal("20000.00"),
            transferred_at="2024-03-15",
            comment="To bank",
            created_by=finance_period.created_by,
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        data = response.data
        # Cash: 50000 - 20000 = 30000
        assert Decimal(data["cash_balance"]) == Decimal("30000.00")
        # Bank: 10000 + 20000 = 30000
        assert Decimal(data["bank_balance"]) == Decimal("30000.00")
        # Profit unchanged
        assert Decimal(data["income_fact"]) == Decimal("60000.00")
        assert Decimal(data["expense_fact"]) == Decimal("0.00")
        assert Decimal(data["net"]) == Decimal("60000.00")

    def test_transfer_bank_to_cash_updates_balances(
        self, api_client, month_period, finance_period
    ):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("5000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="BANK",
            amount=Decimal("30000.00"),
            received_at="2024-03-01",
            comment="Bank income",
            created_by=finance_period.created_by,
        )
        Transfer.objects.create(
            source_account="BANK",
            destination_account="CASH",
            amount=Decimal("15000.00"),
            transferred_at="2024-03-20",
            comment="Withdraw",
            created_by=finance_period.created_by,
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        data = response.data
        # Cash: 5000 + 15000 = 20000
        assert Decimal(data["cash_balance"]) == Decimal("20000.00")
        # Bank: 30000 - 15000 = 15000
        assert Decimal(data["bank_balance"]) == Decimal("15000.00")

    def test_dashboard_balances_include_transfer(
        self, api_client, month_period, finance_period
    ):
        IncomeEntry.objects.create(
            finance_period=finance_period,
            account="CASH",
            amount=Decimal("1000.00"),
            received_at="2024-03-01",
            comment="Income",
            created_by=finance_period.created_by,
        )
        Transfer.objects.create(
            source_account="CASH",
            destination_account="BANK",
            amount=Decimal("400.00"),
            transferred_at="2024-03-10",
            comment="Transfer",
            created_by=finance_period.created_by,
        )
        response = api_client.get("/api/v1/reports/dashboard-kpis/?month=2024-03")
        assert response.status_code == 200
        assert Decimal(response.data["cash_balance"]) == Decimal("600.00")
        assert Decimal(response.data["bank_balance"]) == Decimal("400.00")
