"""
Reports API views.
"""
import calendar
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Sum, Q, Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, views
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.budgeting.models import BudgetLine, BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.planning.models import ActualExpense as PlanningActualExpense
from apps.expenses.services import aggregate_by_category, sum_expenses, get_balance_for_account
from apps.finance.constants import MONTH_REQUIRED_MSG, ADMIN_ONLY_MSG
from apps.finance.models import IncomeEntry, IncomePlan, IncomeSource, Transfer
from apps.reports.services.pdf import build_report_detail_pdf, build_report_section_pdf

from .serializers import BudgetPlanReportSerializer


def _to_decimal_str(value: Decimal) -> str:
    return str((value or Decimal('0.00')).quantize(Decimal('0.00')))


def _ensure_owner_dashboard_access(request) -> None:
    role = getattr(request.user, "role", None)
    if not (request.user.is_superuser or role in ("admin", "director")):
        raise PermissionDenied(ADMIN_ONLY_MSG)


def _get_validated_month_period(month_param: str | None) -> tuple[tuple[str, MonthPeriod] | None, Response | None]:
    if not month_param:
        return None, Response(
            {'month': 'month parameter is required (format: YYYY-MM)'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    month = month_param.strip()
    if not re.match(r'^\d{4}-\d{2}$', month):
        return None, Response(
            {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        month_period = MonthPeriod.objects.get(month=month)
    except MonthPeriod.DoesNotExist:
        return None, Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

    return (month, month_period), None


def _build_dashboard_expense_categories_data(month: str, month_period: MonthPeriod) -> dict[str, Any]:
    plan_qs = BudgetLine.objects.filter(
        plan__period=month_period,
    ).values('category_id', 'category__name').annotate(
        plan=Sum('amount_planned')
    )

    plan_by_category = {}
    for row in plan_qs:
        cid = row['category_id']
        plan_by_category[cid] = {
            'category_id': cid,
            'category_name': row['category__name'] or '',
            'plan': row['plan'] or Decimal('0.00'),
        }

    fact_qs = ExpenseActualExpense.objects.filter(
        month_period=month_period,
    ).values('category_id', 'category__name').annotate(
        fact=Sum('amount'),
        count=Count('id'),
    )

    fact_by_category = {}
    for row in fact_qs:
        cid = row['category_id']
        fact_by_category[cid] = {
            'category_id': cid,
            'category_name': row['category__name'] or '',
            'fact': row['fact'] or Decimal('0.00'),
            'count': row['count'] or 0,
        }

    all_category_ids = set(plan_by_category.keys()) | set(fact_by_category.keys())
    rows = []
    total_plan = Decimal('0.00')
    total_fact = Decimal('0.00')

    for cid in all_category_ids:
        plan_data = plan_by_category.get(cid)
        fact_data = fact_by_category.get(cid)

        plan = plan_data['plan'] if plan_data else Decimal('0.00')
        fact = fact_data['fact'] if fact_data else Decimal('0.00')
        count = fact_data['count'] if fact_data else 0

        category_name = ''
        if plan_data and plan_data.get('category_name'):
            category_name = plan_data['category_name']
        elif fact_data and fact_data.get('category_name'):
            category_name = fact_data['category_name']

        diff = fact - plan
        total_plan += plan
        total_fact += fact
        rows.append({
            'category_id': cid,
            'category_name': category_name,
            'plan': plan,
            'fact': fact,
            'diff': diff,
            'count': count,
        })

    for row in rows:
        fact = row['fact']
        if total_fact > 0:
            share_percent = (fact / total_fact) * Decimal('100')
            row['sharePercent'] = float(share_percent)
        else:
            row['sharePercent'] = None

    serialized_rows = [
        {
            'category_id': row['category_id'],
            'category_name': row['category_name'],
            'plan': _to_decimal_str(row['plan']),
            'fact': _to_decimal_str(row['fact']),
            'diff': _to_decimal_str(row['diff']),
            'count': row['count'],
            'sharePercent': row['sharePercent'],
        }
        for row in rows
    ]

    return {
        'month': month,
        'month_status': month_period.status,
        'totals': {
            'plan': _to_decimal_str(total_plan),
            'fact': _to_decimal_str(total_fact),
        },
        'rows': serialized_rows,
    }


def _build_dashboard_income_sources_data(month: str, month_period: MonthPeriod) -> dict[str, Any]:
    plan_qs = IncomePlan.objects.filter(
        period__month_period=month_period,
    ).values('source_id', 'source__name').annotate(
        plan=Sum('amount')
    )

    plan_by_source: dict[object, dict[str, object]] = {}
    for row in plan_qs:
        sid = row['source_id']
        plan_by_source[sid] = {
            'source_id': sid,
            'source_name': row['source__name'] or '',
            'plan': row['plan'] or Decimal('0.00'),
        }

    fact_qs = IncomeEntry.objects.filter(
        finance_period__month_period=month_period,
    ).values('source_id', 'source__name').annotate(
        fact=Sum('amount'),
        count=Count('id'),
    )

    fact_by_source: dict[object, dict[str, object]] = {}
    for row in fact_qs:
        sid = row['source_id']
        fact_by_source[sid] = {
            'source_id': sid,
            'source_name': row['source__name'] or '',
            'fact': row['fact'] or Decimal('0.00'),
            'count': row['count'] or 0,
        }

    all_source_ids = set(plan_by_source.keys()) | set(fact_by_source.keys())
    rows: list[dict[str, object]] = []
    total_plan = Decimal('0.00')
    total_fact = Decimal('0.00')

    for sid in all_source_ids:
        plan_data = plan_by_source.get(sid)
        fact_data = fact_by_source.get(sid)

        plan = plan_data['plan'] if plan_data else Decimal('0.00')
        fact = fact_data['fact'] if fact_data else Decimal('0.00')
        count = fact_data['count'] if fact_data else 0

        source_name = ''
        if plan_data and plan_data.get('source_name'):
            source_name = plan_data['source_name']
        elif fact_data and fact_data.get('source_name'):
            source_name = fact_data['source_name']

        diff = fact - plan
        total_plan += plan
        total_fact += fact
        rows.append(
            {
                'source_id': sid,
                'source_name': source_name,
                'plan': plan,
                'fact': fact,
                'diff': diff,
                'count': count,
            }
        )

    for row in rows:
        fact_value = row['fact']
        if total_fact > 0:
            share_percent = (fact_value / total_fact) * Decimal('100')
            row['sharePercent'] = float(share_percent)
        else:
            row['sharePercent'] = None

    serialized_rows = [
        {
            'source_id': row['source_id'],
            'source_name': row['source_name'],
            'plan': _to_decimal_str(row['plan']),
            'fact': _to_decimal_str(row['fact']),
            'diff': _to_decimal_str(row['diff']),
            'count': row['count'],
            'sharePercent': row['sharePercent'],
        }
        for row in rows
    ]

    return {
        'month': month,
        'month_status': month_period.status,
        'totals': {
            'plan': _to_decimal_str(total_plan),
            'fact': _to_decimal_str(total_fact),
        },
        'rows': serialized_rows,
    }


def _get_nullable_target_id(
    request,
    param_name: str,
) -> tuple[tuple[int | None, bool] | None, Response | None]:
    raw_value = request.query_params.get(param_name)
    if raw_value is None:
        return None, Response(
            {param_name: f'{param_name} query parameter is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_value = raw_value.strip()
    if raw_value == 'null':
        return (None, True), None

    try:
        return (int(raw_value), False), None
    except (TypeError, ValueError):
        return None, Response(
            {param_name: f'{param_name} must be an integer or "null"'},
            status=status.HTTP_400_BAD_REQUEST,
        )


def _build_income_source_detail_pdf_data(
    month: str,
    month_period: MonthPeriod,
    source_id: int | None,
    is_uncategorized: bool,
) -> dict[str, Any]:
    queryset = (
        IncomeEntry.objects.select_related('source')
        .filter(finance_period__month_period=month_period)
        .order_by('-received_at', '-created_at')
    )

    if is_uncategorized:
        queryset = queryset.filter(source__isnull=True)
        item_name = 'Без источника'
    else:
        source = get_object_or_404(IncomeSource, pk=source_id)
        queryset = queryset.filter(source_id=source.id)
        item_name = source.name

    total_count = queryset.count()
    total_amount = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    return {
        'month': month,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': _to_decimal_str(total_amount),
        'rows': [
            {
                'date': entry.received_at.strftime('%Y-%m-%d'),
                'amount': _to_decimal_str(entry.amount),
                'name': entry.source.name if entry.source else '',
                'comment': entry.comment,
            }
            for entry in queryset
        ],
    }


def _build_expense_category_detail_pdf_data(
    month: str,
    month_period: MonthPeriod,
    category_id: int | None,
    is_uncategorized: bool,
) -> dict[str, Any]:
    queryset = (
        ExpenseActualExpense.objects.select_related('category')
        .filter(month_period=month_period)
        .order_by('-spent_at', '-created_at')
    )

    if is_uncategorized:
        queryset = queryset.filter(category__isnull=True)
        item_name = 'Без категории'
    else:
        category = get_object_or_404(ExpenseCategory, pk=category_id)
        queryset = queryset.filter(category_id=category.id)
        item_name = category.name

    total_count = queryset.count()
    total_amount = queryset.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    return {
        'month': month,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': _to_decimal_str(total_amount),
        'rows': [
            {
                'date': expense.spent_at.strftime('%Y-%m-%d'),
                'amount': _to_decimal_str(expense.amount),
                'name': expense.category.name if expense.category else '',
                'comment': expense.comment,
            }
            for expense in queryset
        ],
    }


class BudgetPlanReportView(views.APIView):
    """Budget plan report with planned vs actual (actuals from apps.expenses ActualExpense by month_period + scope)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, budget_id):
        """Get budget plan report."""
        budget_plan = get_object_or_404(BudgetPlan, pk=budget_id)

        # Planned total from budget lines
        planned_total = BudgetLine.objects.filter(plan=budget_plan).aggregate(
            total=Sum('amount_planned')
        )['total'] or Decimal('0.00')

        # Actual expenses: apps.expenses ActualExpense by month_period + scope
        actual_expenses_qs = ExpenseActualExpense.objects.filter(
            month_period=budget_plan.period,
            scope=budget_plan.scope,
        ).select_related('category', 'created_by').order_by('-spent_at', '-created_at')

        actual_total = sum_expenses(actual_expenses_qs, amount_field='amount')
        delta = actual_total - planned_total
        over_budget = delta > 0

        # Actuals by category (ExpenseActualExpense has category FK)
        actual_by_cat = {}
        for exp in actual_expenses_qs:
            cid = exp.category_id
            if cid not in actual_by_cat:
                actual_by_cat[cid] = Decimal('0.00')
            actual_by_cat[cid] += exp.amount

        # Per-category breakdown
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

        # Add categories that have actuals but no budget line
        line_cat_ids = {line.category_id for line in budget_lines}
        for cid, total in actual_by_cat.items():
            if cid is not None and cid not in line_cat_ids:
                try:
                    cat = ExpenseCategory.objects.get(pk=cid)
                    per_category.append({
                        'category_id': cat.id,
                        'category_name': cat.name,
                        'planned': Decimal('0.00'),
                        'actual': total,
                        'delta': total,
                    })
                except ExpenseCategory.DoesNotExist:
                    pass

        # Expenses list (real fields from ExpenseActualExpense)
        expenses_list = [
            {
                'id': exp.id,
                'date': exp.spent_at,
                'category_name': exp.category.name if exp.category else '',
                'amount': exp.amount,
                'comment': exp.comment,
                'created_by': exp.created_by.username if exp.created_by else 'Unknown',
            }
            for exp in actual_expenses_qs
        ]

        summary_comment = None
        try:
            summary_comment = budget_plan.summary_comment.comment_text
        except BudgetPlanSummaryComment.DoesNotExist:
            pass

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
        
        # Resolve MonthPeriod without auto-creating it.
        try:
            month_period = MonthPeriod.objects.get(month=month)
        except MonthPeriod.DoesNotExist:
            return Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

        # Scope -> category.scope / fund_kind mapping
        scope_lower = {'OFFICE': 'office', 'PROJECT': 'project', 'CHARITY': 'charity'}[scope]

        # Plan: one BudgetPlan per (period, scope); filter by period and scope only
        plans = BudgetPlan.objects.filter(period=month_period, scope=scope)
        plan = plans.first()
        plan_id = plan.id if plan else None

        # Planned: sum BudgetLine.amount_planned grouped by category_id (all plans for this period/scope)
        planned_by_category = {}
        if plans.exists():
            lines = BudgetLine.objects.filter(plan__in=plans).values('category_id', 'category__name').annotate(
                planned=Sum('amount_planned')
            )
            for row in lines:
                cid = row['category_id']
                planned_by_category[cid] = {
                    'category_id': cid,
                    'category_name': row['category__name'] or '',
                    'planned': row['planned'],
                }

        # Actual: ExpenseActualExpense by month + scope (no finance_period)
        actual_qs = ExpenseActualExpense.objects.filter(
            month_period__month=month,
            scope=scope,
        )
        facts_count = actual_qs.count()
        facts_total_actual = float(actual_qs.aggregate(s=Sum('amount'))['s'] or 0)
        uncategorized_count = actual_qs.filter(category__isnull=True).count()
        actual_by_category = aggregate_by_category(
            actual_qs,
            amount_field='amount',
            category_field='category',
        )

        # Uncategorized: category is null
        uncategorized_actual = actual_by_category.get(None, {}).get('total', Decimal('0.00'))
        uncategorized = {
            'planned': 0.0,
            'actual': float(uncategorized_actual),
            'delta': float(uncategorized_actual),
        }

        # Merge planned and actual by category_id (exclude uncategorized from rows)
        category_ids = set(planned_by_category.keys()) | {
            k for k in actual_by_category.keys() if k is not None
        }
        rows = []
        total_planned = Decimal('0.00')
        total_actual = Decimal('0.00')

        for cid in category_ids:
            planned_data = planned_by_category.get(cid)
            planned = planned_data['planned'] if planned_data else Decimal('0.00')
            category_name = (planned_data or {}).get('category_name') or ''
            actual_data = actual_by_category.get(cid)
            actual = (actual_data.get('total') if actual_data else Decimal('0.00'))
            if not category_name and actual_data:
                category_name = actual_data.get('category_name', '') or ''
            delta = actual - planned
            percent = (actual / planned * 100) if planned > 0 else None
            total_planned += planned
            total_actual += actual
            rows.append({
                'category_id': cid,
                'category_name': category_name,
                'planned': float(planned),
                'actual': float(actual),
                'delta': float(delta),
                'percent': float(percent) if percent is not None else None,
            })

        # Add uncategorized actuals to totals (they are excluded from rows)
        total_actual += uncategorized_actual

        # Sort: overspend first (delta desc), then category_name asc
        rows.sort(key=lambda x: (-x['delta'], (x['category_name'] or '')))

        total_delta = total_actual - total_planned
        total_percent = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0

        return Response({
            'month': month,
            'scope': scope,
            'plan_id': plan_id,
            'facts': {
                'count': facts_count,
                'total_actual': facts_total_actual,
                'uncategorized_count': uncategorized_count,
            },
            'totals': {
                'planned': float(total_planned),
                'actual': float(total_actual),
                'delta': float(total_delta),
                'percent': total_percent,
            },
            'rows': rows,
            'uncategorized': uncategorized,
        }, status=status.HTTP_200_OK)


class DashboardExpenseCategoriesView(views.APIView):
    """
    Owner-level expense category breakdown with plan and fact across all scopes.

    GET /api/v1/reports/dashboard-expense-categories/?month=YYYY-MM
    - Admin, director, superuser: allowed
    - Other roles: 403
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_owner_dashboard_access(request)
        validated, error_response = _get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        month, month_period = validated
        response_data = _build_dashboard_expense_categories_data(month, month_period)
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
        _ensure_owner_dashboard_access(request)
        validated, error_response = _get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        month, month_period = validated
        response_data = _build_dashboard_income_sources_data(month, month_period)
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
        _ensure_owner_dashboard_access(request)
        validated, error_response = _get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        section_type = request.query_params.get('section_type')
        if section_type not in ('income_sources', 'expense_categories'):
            return Response(
                {'section_type': 'section_type must be one of: income_sources, expense_categories'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        month, month_period = validated
        if section_type == 'income_sources':
            section_data = _build_dashboard_income_sources_data(month, month_period)
        else:
            section_data = _build_dashboard_expense_categories_data(month, month_period)

        pdf_content = build_report_section_pdf(section_type, section_data)
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="{month}_{section_type}_report.pdf"'
        )
        return response


class ExportIncomeSourceDetailPdfView(views.APIView):
    """
    Export an income-source drill-down section as PDF.

    GET /api/v1/reports/export-income-source-detail-pdf/?month=YYYY-MM&source_id=ID|null
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_owner_dashboard_access(request)
        validated, error_response = _get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        parsed_target, target_error = _get_nullable_target_id(request, 'source_id')
        if target_error:
            return target_error

        month, month_period = validated
        source_id, is_uncategorized = parsed_target
        detail_data = _build_income_source_detail_pdf_data(
            month,
            month_period,
            source_id,
            is_uncategorized,
        )
        pdf_content = build_report_detail_pdf('income_source', detail_data)
        response = HttpResponse(pdf_content, content_type='application/pdf')
        filename_target = 'uncategorized' if is_uncategorized else str(source_id)
        response['Content-Disposition'] = (
            f'attachment; filename="{month}_income_source_{filename_target}_detail_report.pdf"'
        )
        return response


class ExportExpenseCategoryDetailPdfView(views.APIView):
    """
    Export an expense-category drill-down section as PDF.

    GET /api/v1/reports/export-expense-category-detail-pdf/?month=YYYY-MM&category_id=ID|null
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        _ensure_owner_dashboard_access(request)
        validated, error_response = _get_validated_month_period(request.query_params.get('month'))
        if error_response:
            return error_response

        parsed_target, target_error = _get_nullable_target_id(request, 'category_id')
        if target_error:
            return target_error

        month, month_period = validated
        category_id, is_uncategorized = parsed_target
        detail_data = _build_expense_category_detail_pdf_data(
            month,
            month_period,
            category_id,
            is_uncategorized,
        )
        pdf_content = build_report_detail_pdf('expense_category', detail_data)
        response = HttpResponse(pdf_content, content_type='application/pdf')
        filename_target = 'uncategorized' if is_uncategorized else str(category_id)
        response['Content-Disposition'] = (
            f'attachment; filename="{month}_expense_category_{filename_target}_detail_report.pdf"'
        )
        return response


class DashboardKpiView(views.APIView):
    """
    Dashboard KPI view: aggregates all income and expense facts for a month.

    GET /api/v1/reports/dashboard-kpis/?month=YYYY-MM
    - Admin, director: allowed
    - Other roles: 403 (owner-level view, ignores scope/project)
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        role = getattr(request.user, "role", None)
        if not (request.user.is_superuser or role in ("admin", "director")):
            raise PermissionDenied(ADMIN_ONLY_MSG)

        month = request.query_params.get('month')
        if not month:
            return Response(
                {'month': 'month parameter is required (format: YYYY-MM)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        month = month.strip()
        if not re.match(r'^\d{4}-\d{2}$', month):
            return Response(
                {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Ensure MonthPeriod exists (same semantics as other reporting endpoints)
        try:
            month_period = MonthPeriod.objects.get(month=month)
        except MonthPeriod.DoesNotExist:
            return Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

        # Income Fact: sum of all IncomeEntry.amount for this month (all fund_kinds, projects, sources)
        income_qs = IncomeEntry.objects.filter(
            finance_period__month_period=month_period,
        )
        income_total = income_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # Expense Fact: sum of expenses.ActualExpense + planning.ActualExpense for this month
        expense_qs = ExpenseActualExpense.objects.filter(
            month_period=month_period,
        )
        expense_total = expense_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        planning_expense_qs = PlanningActualExpense.objects.filter(
            finance_period__month_period=month_period,
        )
        planning_expense_total = planning_expense_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        expense_total = expense_total + planning_expense_total

        # Income Plan: sum of all IncomePlan.amount for this month across all fund_kinds
        income_plan_qs = IncomePlan.objects.filter(
            period__month_period=month_period,
        )
        income_plan_total = income_plan_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        # Expense Plan: sum of all BudgetLine.amount_planned for this month across all scopes
        expense_plan_qs = BudgetLine.objects.filter(
            plan__period=month_period,
        )
        expense_plan_total = expense_plan_qs.aggregate(total=Sum('amount_planned'))['total'] or Decimal('0.00')

        net_total = income_total - expense_total
        net_plan_total = income_plan_total - expense_plan_total

        def to_decimal_str(value: Decimal) -> str:
            return str(value.quantize(Decimal('0.00')))

        # Opening/closing balances and monthly inflows/outflows per account
        try:
            year_int = int(month[:4])
            month_int = int(month[5:7])
            first_day = date(year_int, month_int, 1)
            last_day = date(year_int, month_int, calendar.monthrange(year_int, month_int)[1])
            prev_day = first_day.replace(day=1) - timedelta(days=1)
        except (ValueError, IndexError):
            # Fallback to zeros if parsing fails (should not happen due to earlier validation)
            cash_opening_balance = Decimal('0.00')
            bank_opening_balance = Decimal('0.00')
            cash_closing_balance = Decimal('0.00')
            bank_closing_balance = Decimal('0.00')
            cash_inflow_month = Decimal('0.00')
            cash_outflow_month = Decimal('0.00')
            bank_inflow_month = Decimal('0.00')
            bank_outflow_month = Decimal('0.00')
        else:
            # Opening and closing balances using shared helper
            cash_opening_balance = get_balance_for_account('CASH', prev_day)
            bank_opening_balance = get_balance_for_account('BANK', prev_day)
            cash_closing_balance = get_balance_for_account('CASH', last_day)
            bank_closing_balance = get_balance_for_account('BANK', last_day)

            # Monthly inflows/outflows for CASH
            income_cash_month = (
                IncomeEntry.objects.filter(
                    account='CASH',
                    received_at__gte=first_day,
                    received_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            transfers_in_cash_month = (
                Transfer.objects.filter(
                    destination_account='CASH',
                    transferred_at__gte=first_day,
                    transferred_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            cash_inflow_month = income_cash_month + transfers_in_cash_month

            expenses_cash_month = (
                ExpenseActualExpense.objects.filter(
                    account='CASH',
                    spent_at__gte=first_day,
                    spent_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            transfers_out_cash_month = (
                Transfer.objects.filter(
                    source_account='CASH',
                    transferred_at__gte=first_day,
                    transferred_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            cash_outflow_month = expenses_cash_month + transfers_out_cash_month

            # Monthly inflows/outflows for BANK
            income_bank_month = (
                IncomeEntry.objects.filter(
                    account='BANK',
                    received_at__gte=first_day,
                    received_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            transfers_in_bank_month = (
                Transfer.objects.filter(
                    destination_account='BANK',
                    transferred_at__gte=first_day,
                    transferred_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            bank_inflow_month = income_bank_month + transfers_in_bank_month

            expenses_bank_month = (
                ExpenseActualExpense.objects.filter(
                    account='BANK',
                    spent_at__gte=first_day,
                    spent_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            transfers_out_bank_month = (
                Transfer.objects.filter(
                    source_account='BANK',
                    transferred_at__gte=first_day,
                    transferred_at__lte=last_day,
                ).aggregate(t=Sum('amount'))['t']
                or Decimal('0.00')
            )
            bank_outflow_month = expenses_bank_month + transfers_out_bank_month

        # Backward-compatible aliases for closing balances
        cash_balance = cash_closing_balance
        bank_balance = bank_closing_balance

        return Response(
            {
                'month': month,
                'income_fact': to_decimal_str(income_total),
                'expense_fact': to_decimal_str(expense_total),
                'net': to_decimal_str(net_total),
                'income_plan': to_decimal_str(income_plan_total),
                'expense_plan': to_decimal_str(expense_plan_total),
                'net_plan': to_decimal_str(net_plan_total),
                'cash_opening_balance': to_decimal_str(cash_opening_balance),
                'bank_opening_balance': to_decimal_str(bank_opening_balance),
                'cash_inflow_month': to_decimal_str(cash_inflow_month),
                'cash_outflow_month': to_decimal_str(cash_outflow_month),
                'bank_inflow_month': to_decimal_str(bank_inflow_month),
                'bank_outflow_month': to_decimal_str(bank_outflow_month),
                'cash_closing_balance': to_decimal_str(cash_closing_balance),
                'bank_closing_balance': to_decimal_str(bank_closing_balance),
                'cash_balance': to_decimal_str(cash_balance),
                'bank_balance': to_decimal_str(bank_balance),
            },
            status=status.HTTP_200_OK,
        )


# Manual test (curl):
# curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/v1/reports/monthly/?month=2026-02&scope=OFFICE"

