"""
Reports API views — thin HTTP layer; aggregation lives in apps.reports.services.
"""
import re
from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, views
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.budgeting.models import BudgetLine, BudgetPlan, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.constants import MONTH_REQUIRED_MSG, ADMIN_ONLY_MSG
from apps.reports.cache import (
    dashboard_kpi_cache_key,
    get_cached_report,
    monthly_report_cache_key,
    reports_cache_enabled,
    set_cached_report,
)
from apps.reports.services.access import ensure_owner_dashboard_access
from apps.reports.services import dashboard as dashboard_service
from apps.reports.services import foreman as foreman_service
from apps.reports.services import monthly as monthly_service
from apps.reports.services.helpers import to_decimal_str
from apps.reports.services.month_input import get_validated_month_period
from apps.reports.services.query_params import parse_nullable_target_id
from apps.reports.services import pdf_exports
from apps.reports.services import transfers as transfers_service

from .serializers import BudgetPlanReportSerializer, ForemanProjectSummaryDataSerializer


def _get_validated_optional_date_range(request):
    start_raw = request.query_params.get('start_date')
    end_raw = request.query_params.get('end_date')
    if not start_raw and not end_raw:
        return None, None, None
    if not start_raw or not end_raw:
        return None, None, Response(
            {'date_range': 'start_date and end_date must be provided together.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        start_date = date.fromisoformat(start_raw)
        end_date = date.fromisoformat(end_raw)
    except ValueError:
        return None, None, Response(
            {'date_range': 'Invalid date format. Use YYYY-MM-DD.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if end_date < start_date:
        return None, None, Response(
            {'date_range': 'end_date must be greater than or equal to start_date.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return start_date, end_date, None


class BudgetPlanReportView(views.APIView):
    """Budget plan report with planned vs actual (actuals from apps.expenses ActualExpense by month_period + scope)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, budget_id):
        """Get budget plan report."""
        budget_plan = get_object_or_404(
            BudgetPlan.objects.select_related('summary_comment'),
            pk=budget_id,
        )

        planned_total = BudgetLine.objects.filter(plan=budget_plan).aggregate(
            total=Sum('amount_planned')
        )['total'] or Decimal('0.00')

        actual_expenses_qs = ExpenseActualExpense.objects.filter(
            month_period=budget_plan.period,
            scope=budget_plan.scope,
        ).select_related('category', 'created_by').order_by('-spent_at', '-created_at')

        actual_expenses_list = list(actual_expenses_qs)
        actual_by_cat = {}
        actual_total = Decimal('0.00')
        for exp in actual_expenses_list:
            actual_total += exp.amount
            cid = exp.category_id
            if cid not in actual_by_cat:
                actual_by_cat[cid] = Decimal('0.00')
            actual_by_cat[cid] += exp.amount

        delta = actual_total - planned_total
        over_budget = delta > 0

        budget_lines = BudgetLine.objects.filter(plan=budget_plan).select_related('category')
        per_category = []
        for line in budget_lines:
            category_actual = actual_by_cat.get(line.category_id, Decimal('0.00'))
            per_category.append({
                'category_id': line.category.id,
                'category_name': line.category.name,
                'planned': line.amount_planned,
                'actual': category_actual,
                'delta': category_actual - line.amount_planned,
            })

        line_cat_ids = {line.category_id for line in budget_lines}
        extra_cat_ids = [cid for cid in actual_by_cat if cid is not None and cid not in line_cat_ids]
        for cid, cat in ExpenseCategory.objects.in_bulk(extra_cat_ids).items():
            total = actual_by_cat[cid]
            per_category.append({
                'category_id': cat.id,
                'category_name': cat.name,
                'planned': Decimal('0.00'),
                'actual': total,
                'delta': total,
            })

        expenses_list = [
            {
                'id': exp.id,
                'date': exp.spent_at,
                'category_name': exp.category.name if exp.category else '',
                'amount': exp.amount,
                'comment': exp.comment,
                'created_by': exp.created_by.username if exp.created_by else 'Unknown',
            }
            for exp in actual_expenses_list
        ]

        sc = getattr(budget_plan, 'summary_comment', None)
        summary_comment = sc.comment_text if sc else None

        report_data = {
            'planned_total': planned_total,
            'actual_total': actual_total,
            'delta': delta,
            'over_budget': over_budget,
            'per_category': per_category,
            'expenses': expenses_list,
            'summary_comment': summary_comment,
        }

        serializer = BudgetPlanReportSerializer(data=report_data)
        serializer.is_valid(raise_exception=True)
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class MonthlyReportView(views.APIView):
    """
    Monthly Plan vs Fact report: one endpoint for plan vs actual by category.

    Actuals (facts.totals.actual, per-row actual) use only apps.expenses.ActualExpense
    for the MonthPeriod and scope (OFFICE|PROJECT|CHARITY). apps.planning.ActualExpense
    is not included — it has no scope/account alignment with this report.

    GET /api/v1/reports/monthly/?month=YYYY-MM&scope=OFFICE|PROJECT|CHARITY
    - Admin, director: any scope. Foreman: scope=PROJECT only. Other roles: 403.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, 'role', None)
        if request.user.is_superuser:
            pass
        elif role in ('admin', 'director'):
            pass
        elif role == 'foreman':
            if request.query_params.get('scope') != 'PROJECT':
                raise PermissionDenied('Reports are not available for your role.')
        else:
            raise PermissionDenied('Reports are not available for your role.')

        month = request.query_params.get('month')
        scope = request.query_params.get('scope')

        if not month:
            return Response(
                {'month': 'month parameter is required (format: YYYY-MM)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not re.match(r'^\d{4}-\d{2}$', month.strip()):
            return Response(
                {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        month = month.strip()

        if not scope:
            return Response(
                {'scope': 'scope parameter is required (OFFICE, PROJECT, or CHARITY)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if scope not in ('OFFICE', 'PROJECT', 'CHARITY'):
            return Response(
                {'scope': 'scope must be one of: OFFICE, PROJECT, CHARITY'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            month_period = MonthPeriod.objects.get(month=month)
        except MonthPeriod.DoesNotExist:
            return Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

        if reports_cache_enabled():
            cache_key = monthly_report_cache_key(month, scope, month_period.pk)
            payload = get_cached_report(cache_key)
            if payload is not None:
                return Response(payload, status=status.HTTP_200_OK)
        payload = monthly_service.build_monthly_report_payload(month, scope, month_period)
        if reports_cache_enabled():
            set_cached_report(monthly_report_cache_key(month, scope, month_period.pk), payload)
        return Response(payload, status=status.HTTP_200_OK)


class DashboardExpenseCategoriesView(views.APIView):
    """
    Owner-level expense category breakdown with plan and fact across all scopes.

    GET /api/v1/reports/dashboard-expense-categories/?month=YYYY-MM
    - Admin, director, superuser: allowed
    - Other roles: 403
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error

        month, month_period = validated
        account_param = (request.query_params.get('account') or '').strip().upper()
        account = account_param if account_param in ('CASH', 'BANK') else None
        response_data = dashboard_service.build_dashboard_expense_categories_data(
            month,
            month_period,
            account=account,
            start_date=start_date,
            end_date=end_date,
        )
        return Response(
            {
                'month': response_data['month'],
                'totals': response_data['totals'],
                'rows': response_data['rows'],
            },
            status=status.HTTP_200_OK,
        )


class DashboardIncomeSourcesView(views.APIView):
    """
    Owner-level income source breakdown with plan and fact across all fund_kinds.

    GET /api/v1/reports/dashboard-income-sources/?month=YYYY-MM
    - Admin, director, superuser: allowed
    - Other roles: 403
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error

        month, month_period = validated
        account_param = (request.query_params.get('account') or '').strip().upper()
        account = account_param if account_param in ('CASH', 'BANK') else None
        response_data = dashboard_service.build_dashboard_income_sources_data(
            month,
            month_period,
            account=account,
            start_date=start_date,
            end_date=end_date,
        )
        return Response(
            {
                'month': response_data['month'],
                'totals': response_data['totals'],
                'rows': response_data['rows'],
            },
            status=status.HTTP_200_OK,
        )


class ExportSectionPdfView(views.APIView):
    """
    Export a dashboard section as PDF.

    GET /api/v1/reports/export-section-pdf/?month=YYYY-MM&section_type=income_sources|expense_categories
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error

        section_type = request.query_params.get('section_type')
        if section_type not in ('income_sources', 'expense_categories'):
            return Response(
                {'section_type': 'section_type must be one of: income_sources, expense_categories'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        month, month_period = validated
        account_param = (request.query_params.get('account') or '').strip().upper()
        account = account_param if account_param in ('CASH', 'BANK') else None
        pdf_content, filename = pdf_exports.run_export_section_pdf(
            month,
            month_period,
            section_type,
            account,
            start_date=start_date,
            end_date=end_date,
        )
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ExportIncomeSourceDetailPdfView(views.APIView):
    """
    Export an income-source drill-down section as PDF.

    GET /api/v1/reports/export-income-source-detail-pdf/?month=YYYY-MM&source_id=ID|null
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error

        parsed_target, target_error = parse_nullable_target_id(request, 'source_id')
        if target_error:
            return target_error

        month, month_period = validated
        account_param = (request.query_params.get('account') or '').strip().upper()
        account = account_param if account_param in ('CASH', 'BANK') else None
        source_id, is_uncategorized = parsed_target
        pdf_content, filename = pdf_exports.run_export_income_source_detail_pdf(
            month,
            month_period,
            source_id,
            is_uncategorized,
            account,
            start_date=start_date,
            end_date=end_date,
        )
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ExportExpenseCategoryDetailPdfView(views.APIView):
    """
    Export an expense-category drill-down section as PDF.

    GET /api/v1/reports/export-expense-category-detail-pdf/?month=YYYY-MM&category_id=ID|null
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error

        parsed_target, target_error = parse_nullable_target_id(request, 'category_id')
        if target_error:
            return target_error

        month, month_period = validated
        account_param = (request.query_params.get('account') or '').strip().upper()
        account = account_param if account_param in ('CASH', 'BANK') else None
        category_id, is_uncategorized = parsed_target
        pdf_content, filename = pdf_exports.run_export_expense_category_detail_pdf(
            month,
            month_period,
            category_id,
            is_uncategorized,
            account,
            start_date=start_date,
            end_date=end_date,
        )
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class DashboardKpiView(views.APIView):
    """
    Dashboard KPI view: aggregates income and expense facts for a month.

    Semantics (aligned with get_balance_for_account and MonthlyReportView actuals):
    - expense_fact: sum of apps.expenses.ActualExpense for the MonthPeriod (all scopes).
      These rows carry CASH/BANK and drive balance and cash_*_outflow_month.
    - planning_actual_expense_total: sum of apps.planning.ActualExpense for the month
      (via finance_period.month_period). No account field — not included in expense_fact
      or balance; reported separately for transparency.

    GET /api/v1/reports/dashboard-kpis/?month=YYYY-MM
    - Admin, director: allowed
    - Other roles: 403 (owner-level view, ignores scope/project)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, "role", None)
        if not (request.user.is_superuser or role in ("admin", "director")):
            raise PermissionDenied(ADMIN_ONLY_MSG)

        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        month, month_period = validated
        if reports_cache_enabled():
            cache_key = dashboard_kpi_cache_key(month, month_period.pk)
            data = get_cached_report(cache_key)
            if data is not None:
                return Response(data, status=status.HTTP_200_OK)
        data = dashboard_service.build_dashboard_kpi_response_data(month, month_period)
        if reports_cache_enabled():
            set_cached_report(dashboard_kpi_cache_key(month, month_period.pk), data)
        return Response(data, status=status.HTTP_200_OK)


class TransferDetailsView(views.APIView):
    """
    List internal transfers between CASH and BANK for a given month, grouped by direction.

    GET /api/v1/reports/transfer-details/?month=YYYY-MM
    - Admin, director: allowed
    - Other roles: 403 (owner-level view)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        month, _month_period = validated
        payload = transfers_service.build_transfer_details_payload(month)
        if payload.get('_parse_error'):
            return Response(
                {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                'month': payload['month'],
                'bank_to_cash': payload['bank_to_cash'],
                'cash_to_bank': payload['cash_to_bank'],
            },
            status=status.HTTP_200_OK,
        )


class ExportTransfersDirectionPdfView(views.APIView):
    """
    Export transfers for a single direction as PDF.

    GET /api/v1/reports/transfers-direction-pdf/?month=YYYY-MM&direction=BANK_TO_CASH|CASH_TO_BANK
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        month, _month_period = validated

        raw_direction = (request.query_params.get('direction') or '').strip().upper()
        if raw_direction not in ('BANK_TO_CASH', 'CASH_TO_BANK'):
            return Response(
                {'direction': 'direction must be one of: BANK_TO_CASH, CASH_TO_BANK'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        built = pdf_exports.run_export_transfer_direction_pdf(month, raw_direction)
        if built is None:
            return Response(
                {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pdf_bytes, filename = built
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class CashMovementPdfView(views.APIView):
    """
    Export account statement PDF for a selected date range.

    GET /api/v1/reports/cash-movement-pdf/?account=CASH|BANK&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        ensure_owner_dashboard_access(request)
        account = (request.query_params.get('account') or '').strip().upper()
        if account not in ('CASH', 'BANK'):
            return Response(
                {'account': 'account must be one of: CASH, BANK'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date, end_date, range_error = _get_validated_optional_date_range(request)
        if range_error:
            return range_error
        if not start_date or not end_date:
            return Response(
                {'date_range': 'start_date and end_date are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pdf_bytes, filename = pdf_exports.run_export_cash_movement_pdf(
            account=account,
            start_date=start_date,
            end_date=end_date,
        )
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ForemanProjectSummaryView(views.APIView):
    """
    Foreman summary for the single PROJECT-scope budget for a month.

    BudgetPlan is unique per (period, scope) and BudgetPlan.project must stay NULL
    (see apps.budgeting.models.BudgetPlan.clean). There is no per-project split of
    planned amounts in the data model.

    Returns:
    - summary: one planned_total (all BudgetLine for the PROJECT plan for this month),
      one actual_total (all expenses.ActualExpense with scope=PROJECT), difference.
    - assigned_projects: this user's ProjectAssignment rows (id + name); may be empty.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, 'role', None)
        if not (request.user.is_superuser or role == 'foreman'):
            raise PermissionDenied('This endpoint is available for foreman only.')

        validated, error_response = get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response
        month, month_period = validated

        data_payload = foreman_service.build_foreman_project_summary_data_payload(
            month, month_period, request.user
        )
        serializer = ForemanProjectSummaryDataSerializer(data=data_payload)
        serializer.is_valid(raise_exception=True)
        return Response(
            {
                'success': True,
                'code': 'SUCCESS',
                'message': 'Foreman project summary retrieved.',
                'data': serializer.validated_data,
            },
            status=status.HTTP_200_OK,
        )
