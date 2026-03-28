"""
Future async PDF export tasks (Celery / RQ).

**No worker is configured in this repository yet.** Do not import this module from
Django startup unless you add celery to INSTALLED_APPS and a broker.

When you enable background exports:

1. Add `celery`, broker URL, and a worker service (see `services/pdf_exports.py` docstring).
2. Implement tasks that call `apps.reports.services.pdf_exports.run_*` with the same
   arguments the HTTP layer uses, then persist `bytes` to storage and mark a job row complete.
3. Keep the existing GET PDF endpoints as the synchronous fallback (or feature-flag).

Example skeleton (commented):

    # from celery import shared_task
    # from apps.reports.services import pdf_exports
    #
    # @shared_task
    # def export_section_pdf_task(month: str, month_period_id: int, section_type: str, account: str | None):
    #     from apps.budgeting.models import MonthPeriod
    #     mp = MonthPeriod.objects.get(pk=month_period_id)
    #     body, name = pdf_exports.run_export_section_pdf(month, mp, section_type, account)
    #     # save body, update ExportJob...
    #     return name
"""
