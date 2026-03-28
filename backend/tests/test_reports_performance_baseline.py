"""
Regression guard: report builders must not grow query count without review.

After intentional ORM changes, re-measure and edit tests/baselines/report_service_query_budgets.json
(or run tools in docs/REPORTS_PERFORMANCE_BASELINE.md).

Profiling discipline doc: docs/REPORTS_PERFORMANCE_BASELINE.md
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from django.conf import settings

from apps.reports.performance.profiling import profile_callable
from apps.reports.services import dashboard as dashboard_service
from apps.reports.services import monthly as monthly_service
from apps.budgeting.models import MonthPeriod
from apps.reports.services import transfers as transfers_service

pytestmark = pytest.mark.django_db

BASELINE_PATH = Path(__file__).resolve().parent / 'baselines' / 'report_service_query_budgets.json'


@pytest.fixture
def month_period_open(db):
    """Isolated MonthPeriod for profiling (unique month avoids clashes across test modules)."""
    mp, _ = MonthPeriod.objects.get_or_create(
        month='2098-06',
        defaults={'status': 'OPEN'},
    )
    return mp


def _load_budgets():
    if not BASELINE_PATH.is_file():
        pytest.skip(f'Missing baseline file {BASELINE_PATH}')
    data = json.loads(BASELINE_PATH.read_text(encoding='utf-8'))
    return data['with_minimal_db']


def _scenario_runners(month: str, mp):
    return {
        'dashboard_kpi': lambda: dashboard_service.build_dashboard_kpi_response_data(month, mp),
        'monthly_office': lambda: monthly_service.build_monthly_report_payload(month, 'OFFICE', mp),
        'monthly_project': lambda: monthly_service.build_monthly_report_payload(month, 'PROJECT', mp),
        'monthly_charity': lambda: monthly_service.build_monthly_report_payload(month, 'CHARITY', mp),
        'dashboard_expense_categories_all': lambda: dashboard_service.build_dashboard_expense_categories_data(
            month, mp, account=None
        ),
        'dashboard_income_sources_all': lambda: dashboard_service.build_dashboard_income_sources_data(
            month, mp, account=None
        ),
        'transfer_details_json': lambda: transfers_service.build_transfer_details_payload(month),
    }


@pytest.mark.report_perf
def test_report_service_query_budgets(month_period_open):
    """Fail if query count grows past committed budgets (minimal DB)."""
    settings.REPORTS_CACHE_ENABLED = False
    month = month_period_open.month
    mp = month_period_open
    budgets = _load_budgets()
    runners = _scenario_runners(month, mp)

    for name, fn in runners.items():
        spec = budgets.get(name)
        if not spec:
            continue
        report = profile_callable(fn)
        max_q = int(spec['max_queries'])
        assert report.query_count <= max_q, (
            f'{name}: {report.query_count} queries > budget {max_q}. '
            f'If intentional, run pytest with --baseline-write after review.'
        )


def test_profile_reports_harness_smoke(month_period_open):
    """Ensure profiling wrapper runs without error."""
    settings.REPORTS_CACHE_ENABLED = False
    report = profile_callable(
        lambda: dashboard_service.build_dashboard_kpi_response_data(
            month_period_open.month, month_period_open
        )
    )
    assert report.query_count >= 0
    assert report.duration_ms >= 0
