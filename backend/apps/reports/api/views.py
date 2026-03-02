"""
Reports API views.
"""
import re
from decimal import Decimal

from django.db.models import Sum, Q
from rest_framework import status, views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied

from apps.budgeting.models import BudgetLine, BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.expenses.services import aggregate_by_category, sum_expenses
from apps.finance.constants import MONTH_REQUIRED_MSG
from .serializers import BudgetPlanReportSerializer
from django.shortcuts import get_object_or_404


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


# Manual test (curl):
# curl -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/v1/reports/monthly/?month=2026-02&scope=OFFICE"

