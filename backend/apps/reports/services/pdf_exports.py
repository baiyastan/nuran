"""
Synchronous PDF export pipeline — single entry points for report PDF bytes + filenames.

HTTP views delegate here today; a future Celery (or RQ) worker should call the same
functions so export semantics stay identical.

------------------------------------------------------------------------------
Async rollout order (heaviest / risk first — adjust with production metrics)
------------------------------------------------------------------------------

1. **export-income-source-detail-pdf** / **export-expense-category-detail-pdf**  
   Often largest row counts (full entry lists + ReportLab layout). Highest CPU/memory
   per request.

2. **export-section-pdf** (income_sources | expense_categories)  
   Aggregated tables but still full ReportLab build + font registration.

3. **transfers-direction-pdf**  
   Typically smaller row volume; cheaper but same blocking pattern.

JSON report endpoints (dashboard sections, KPI, monthly, transfer-details) stay on
the request path unless you add separate “export JSON to file” product requirements.

------------------------------------------------------------------------------
Background worker infra
------------------------------------------------------------------------------

**Not required for this refactor.** The code here runs synchronously as before.

**Later:** Celery + Redis (you already use Redis for cache in many deployments) or
RQ with Django ORM is the lightest addition: one queue, one worker process, optional
django-celery-results for job status. Store finished PDFs in object storage or
FileField with TTL cleanup.

------------------------------------------------------------------------------
Implementation plan (phases)
------------------------------------------------------------------------------

*Done (this module):* Extract data assembly + `build_*_pdf` into `run_*` functions.

*Next:* Add `POST /exports/` (or similar) that validates params, creates `ExportJob`
row (pending), enqueues task, returns `202 { job_id }`. Add `GET /exports/{id}/`
returning status + download URL when ready.

*Avoid until needed:* Second-phase “async” that only threads inside the same process
(GIL-bound for ReportLab CPU) — prefer a real worker process.
"""
from __future__ import annotations

from apps.budgeting.models import MonthPeriod
from apps.reports.services import dashboard as dashboard_service
from apps.reports.services import transfers as transfers_service
from apps.reports.services.pdf import (
    build_report_detail_pdf,
    build_report_section_pdf,
    build_transfer_direction_pdf,
)


def _account_filter_label(account: str | None) -> str:
    return 'Касса' if account == 'CASH' else 'Банк' if account == 'BANK' else 'Все'


def run_export_section_pdf(
    month: str,
    month_period: MonthPeriod,
    section_type: str,
    account: str | None,
) -> tuple[bytes, str]:
    """Build dashboard section PDF (income_sources or expense_categories)."""
    if section_type == 'income_sources':
        section_data = dashboard_service.build_dashboard_income_sources_data(
            month, month_period, account=account
        )
    else:
        section_data = dashboard_service.build_dashboard_expense_categories_data(
            month, month_period, account=account
        )
    section_data['account_filter_label'] = _account_filter_label(account)
    pdf_content = build_report_section_pdf(section_type, section_data)
    filename = f'{month}_{section_type}_report.pdf'
    return pdf_content, filename


def run_export_income_source_detail_pdf(
    month: str,
    month_period: MonthPeriod,
    source_id: int | None,
    is_uncategorized: bool,
    account: str | None,
) -> tuple[bytes, str]:
    detail_data = dashboard_service.build_income_source_detail_pdf_data(
        month,
        month_period,
        source_id,
        is_uncategorized,
        account=account,
    )
    detail_data['account_filter_label'] = _account_filter_label(account)
    pdf_content = build_report_detail_pdf('income_source', detail_data)
    filename_target = 'uncategorized' if is_uncategorized else str(source_id)
    filename = f'{month}_income_source_{filename_target}_detail_report.pdf'
    return pdf_content, filename


def run_export_expense_category_detail_pdf(
    month: str,
    month_period: MonthPeriod,
    category_id: int | None,
    is_uncategorized: bool,
    account: str | None,
) -> tuple[bytes, str]:
    detail_data = dashboard_service.build_expense_category_detail_pdf_data(
        month,
        month_period,
        category_id,
        is_uncategorized,
        account=account,
    )
    detail_data['account_filter_label'] = _account_filter_label(account)
    pdf_content = build_report_detail_pdf('expense_category', detail_data)
    filename_target = 'uncategorized' if is_uncategorized else str(category_id)
    filename = f'{month}_expense_category_{filename_target}_detail_report.pdf'
    return pdf_content, filename


def run_export_transfer_direction_pdf(
    month: str,
    direction: str,
) -> tuple[bytes, str] | None:
    """
    direction: BANK_TO_CASH | CASH_TO_BANK
    Returns None if month string cannot be parsed (caller should return 400).
    """
    if direction == 'BANK_TO_CASH':
        source_account = 'BANK'
        destination_account = 'CASH'
        direction_label = 'Банк → Касса'
        filename_direction = 'bank_to_cash'
    else:
        source_account = 'CASH'
        destination_account = 'BANK'
        direction_label = 'Касса → Банк'
        filename_direction = 'cash_to_bank'

    result = transfers_service.query_transfers_for_direction_pdf(
        month, source_account, destination_account
    )
    if result is None:
        return None
    total_amount, detail_rows = result
    pdf_bytes = build_transfer_direction_pdf(
        month=month,
        direction_label=direction_label,
        total_amount=total_amount,
        detail_rows=detail_rows,
    )
    filename = f'transfers_{filename_direction}_{month}.pdf'
    return pdf_bytes, filename
