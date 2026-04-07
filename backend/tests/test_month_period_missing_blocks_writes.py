"""
Tests that missing MonthPeriod blocks both plan-side and fact-side writes.
"""
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.finance.constants import MONTH_REQUIRED_MSG


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


class TestMonthPeriodMissingBlocksWrites:
  """When MonthPeriod is missing, both facts and plans must fail."""

  def _auth(self, client, user):
      token = RefreshToken.for_user(user)
      client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.access_token}")

  def test_missing_month_period_blocks_budgetplan_create(self, api_client, admin_user):
      """Creating BudgetPlan by month string for a non-existent MonthPeriod must fail."""
      self._auth(api_client, admin_user)

      payload = {
          "period": "2099-12",  # MonthPeriod with this month does not exist
          "scope": "OFFICE",
          "project": None,
      }

      response = api_client.post("/api/v1/budgets/budgets/", payload, format="json")
      assert response.status_code == 400
      # Error should be a field error on period with standardized message
      assert "period" in response.data
      # DRF ValidationError wraps field messages in a list
      assert response.data["period"][0] == MONTH_REQUIRED_MSG

  def test_missing_month_period_blocks_actualexpense_create(self, api_client, admin_user):
      """Creating ActualExpense by month string when MonthPeriod does not exist must fail."""
      self._auth(api_client, admin_user)

      payload = {
          "month": "2099-11",  # MonthPeriod with this month does not exist
          "scope": "OFFICE",
          "category": None,
          "account": "CASH",
          "amount": "100.00",
          "spent_at": "2099-11-10",
          "comment": "Missing month-period actual expense",
      }

      response = api_client.post("/api/v1/actual-expenses/", payload, format="json")
      assert response.status_code == 400
      assert "month period does not exist" in str(response.data).lower()

  def test_missing_month_period_blocks_plan_period_create(self, api_client, admin_user):
      """PlanPeriod create must fail when target month does not exist."""
      self._auth(api_client, admin_user)
      response = api_client.post(
          "/api/v1/plan-periods/",
          {
              "fund_kind": "office",
              "period": "2099-10",
          },
          format="json",
      )
      assert response.status_code == 400
      assert "period" in response.data
      assert MONTH_REQUIRED_MSG.lower() in str(response.data).lower()

