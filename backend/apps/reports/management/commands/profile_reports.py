"""
Profile report service builders: query count, wall time, repeated SQL shapes.

Usage:
  python manage.py profile_reports --month 2024-02
  python manage.py profile_reports --month 2024-02 --explain 2

Requires an existing MonthPeriod for the given month. Uses cold path (short-term
report cache disabled for the duration of the command).

Does not change business logic or persisted data.
"""
from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.budgeting.models import MonthPeriod
from apps.reports.performance.profiling import (
    explain_select_sql,
    longest_queries,
    profile_callable,
)
from apps.reports.services import dashboard as dashboard_service
from apps.reports.services import monthly as monthly_service
from apps.reports.services import transfers as transfers_service


class Command(BaseCommand):
    help = 'Profile report builders (queries + timing) for a MonthPeriod'

    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            type=str,
            required=True,
            help='YYYY-MM matching an existing MonthPeriod',
        )
        parser.add_argument(
            '--explain',
            type=int,
            default=0,
            metavar='N',
            help='Print EXPLAIN for up to N slowest SELECT queries per scenario (PG/SQLite)',
        )
        parser.add_argument(
            '--include-pdf-data',
            action='store_true',
            help='Also profile PDF section export (ReportLab CPU + same DB as section JSON)',
        )

    def handle(self, *args, **options):
        month = options['month'].strip()
        explain_n = max(0, options['explain'])
        include_pdf = options['include_pdf_data']

        try:
            mp = MonthPeriod.objects.get(month=month)
        except MonthPeriod.DoesNotExist as exc:
            raise CommandError(
                f'No MonthPeriod for month={month!r}. Create one or pick an existing month.'
            ) from exc

        old_cache = getattr(settings, 'REPORTS_CACHE_ENABLED', True)
        settings.REPORTS_CACHE_ENABLED = False
        try:
            scenarios: list[tuple[str, object]] = [
                (
                    'dashboard_kpi',
                    lambda: dashboard_service.build_dashboard_kpi_response_data(month, mp),
                ),
                (
                    'monthly_OFFICE',
                    lambda: monthly_service.build_monthly_report_payload(month, 'OFFICE', mp),
                ),
                (
                    'monthly_PROJECT',
                    lambda: monthly_service.build_monthly_report_payload(month, 'PROJECT', mp),
                ),
                (
                    'monthly_CHARITY',
                    lambda: monthly_service.build_monthly_report_payload(month, 'CHARITY', mp),
                ),
                (
                    'dashboard_expense_categories_all',
                    lambda: dashboard_service.build_dashboard_expense_categories_data(
                        month, mp, account=None
                    ),
                ),
                (
                    'dashboard_expense_categories_CASH',
                    lambda: dashboard_service.build_dashboard_expense_categories_data(
                        month, mp, account='CASH'
                    ),
                ),
                (
                    'dashboard_income_sources_all',
                    lambda: dashboard_service.build_dashboard_income_sources_data(
                        month, mp, account=None
                    ),
                ),
                (
                    'dashboard_income_sources_BANK',
                    lambda: dashboard_service.build_dashboard_income_sources_data(
                        month, mp, account='BANK'
                    ),
                ),
                (
                    'transfer_details_json',
                    lambda: transfers_service.build_transfer_details_payload(month),
                ),
            ]

            if include_pdf:
                from apps.reports.services import pdf_exports

                scenarios.append(
                    (
                        'pdf_section_income_sources',
                        lambda: pdf_exports.run_export_section_pdf(
                            month, mp, 'income_sources', None
                        ),
                    )
                )

            self.stdout.write(self.style.NOTICE(f'Profiling MonthPeriod id={mp.pk} month={month}'))
            self.stdout.write(
                f'{"name":<40} {"queries":>8} {"db_ms":>10} {"wall_ms":>10}  repeated_top'
            )
            self.stdout.write('-' * 120)

            for name, fn in scenarios:
                report = profile_callable(fn)
                top_repeat = (
                    report.sql_fingerprint_counts[0]
                    if report.sql_fingerprint_counts
                    else ('', 0)
                )
                repeat_hint = f'{top_repeat[1]}× {top_repeat[0][:48]}…' if top_repeat[0] else ''
                self.stdout.write(
                    f'{name:<40} {report.query_count:>8} '
                    f'{report.total_db_time_ms:>10.2f} {report.duration_ms:>10.2f}  {repeat_hint}'
                )

                if explain_n and report.queries:
                    self.stdout.write(self.style.WARNING(f'  -- slowest queries ({name}) --'))
                    for q in longest_queries(report.queries, explain_n):
                        sql = q.get('sql', '')
                        plan = explain_select_sql(sql)
                        if plan:
                            self.stdout.write(f"  time={q.get('time')}s\n{plan[:2000]}\n")
                        else:
                            self.stdout.write(f"  (skip EXPLAIN) time={q.get('time')}s\n")
        finally:
            settings.REPORTS_CACHE_ENABLED = old_cache
