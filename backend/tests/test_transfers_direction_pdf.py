from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model

from apps.budgeting.models import MonthPeriod
from apps.finance.models import Transfer


User = get_user_model()


@pytest.fixture
def admin_user(db):
  return User.objects.create_user(
    username='admin',
    email='admin@test.com',
    password='testpass123',
    role='admin',
  )


@pytest.fixture
def month_period_2026_03(db):
  return MonthPeriod.objects.create(month='2026-03', status='OPEN')


class TestExportTransfersDirectionPdfView:
  def _auth_client(self, admin_user):
    from rest_framework.test import APIClient
    from rest_framework_simplejwt.tokens import RefreshToken

    client = APIClient()
    token = RefreshToken.for_user(admin_user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client

  def test_bank_to_cash_direction_exports_only_bank_to_cash_rows(
    self,
    admin_user,
    month_period_2026_03,
  ):
    client = self._auth_client(admin_user)

    # Create transfers in March 2026
    Transfer.objects.create(
      source_account='BANK',
      destination_account='CASH',
      amount=Decimal('100.00'),
      transferred_at='2026-03-05',
      comment='B->C in month',
      created_by=admin_user,
    )
    # Opposite direction (should not be included)
    Transfer.objects.create(
      source_account='CASH',
      destination_account='BANK',
      amount=Decimal('200.00'),
      transferred_at='2026-03-10',
      comment='C->B in month',
      created_by=admin_user,
    )
    # Outside of month (should not be included)
    Transfer.objects.create(
      source_account='BANK',
      destination_account='CASH',
      amount=Decimal('300.00'),
      transferred_at='2026-04-01',
      comment='Other month',
      created_by=admin_user,
    )

    resp = client.get(
      '/api/v1/reports/transfers-direction-pdf/?month=2026-03&direction=BANK_TO_CASH'
    )
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')

  def test_cash_to_bank_direction_exports_only_cash_to_bank_rows(
    self,
    admin_user,
    month_period_2026_03,
  ):
    client = self._auth_client(admin_user)

    # Create transfers in March 2026
    Transfer.objects.create(
      source_account='CASH',
      destination_account='BANK',
      amount=Decimal('150.00'),
      transferred_at='2026-03-07',
      comment='C->B in month',
      created_by=admin_user,
    )
    # Opposite direction (should not be included)
    Transfer.objects.create(
      source_account='BANK',
      destination_account='CASH',
      amount=Decimal('50.00'),
      transferred_at='2026-03-08',
      comment='B->C in month',
      created_by=admin_user,
    )

    resp = client.get(
      '/api/v1/reports/transfers-direction-pdf/?month=2026-03&direction=CASH_TO_BANK'
    )
    assert resp.status_code == 200
    assert resp['Content-Type'] == 'application/pdf'
    assert resp.content.startswith(b'%PDF')

  def test_invalid_direction_returns_400(self, admin_user, month_period_2026_03):
    client = self._auth_client(admin_user)

    resp = client.get(
      '/api/v1/reports/transfers-direction-pdf/?month=2026-03&direction=INVALID'
    )
    assert resp.status_code == 400
    assert 'direction' in resp.data

