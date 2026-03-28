"""Foreman project summary aggregates (global PROJECT scope; ExpenseActualExpense actuals)."""
from decimal import Decimal

from django.db.models import Sum

from apps.budgeting.models import BudgetLine, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.projects.models import ProjectAssignment


def build_foreman_project_summary_data_payload(
    month: str,
    month_period: MonthPeriod,
    user,
) -> dict:
    """
    Raw dict for ForemanProjectSummaryDataSerializer (Decimals on summary fields).
    """
    assignments = (
        ProjectAssignment.objects
        .select_related('project')
        .filter(prorab=user)
        .order_by('project__name', 'project_id')
    )

    planned_total = (
        BudgetLine.objects.filter(
            plan__period=month_period,
            plan__scope='PROJECT',
        ).aggregate(total=Sum('amount_planned'))['total']
        or Decimal('0.00')
    )

    actual_total = (
        ExpenseActualExpense.objects.filter(
            month_period=month_period,
            scope='PROJECT',
        ).aggregate(total=Sum('amount'))['total']
        or Decimal('0.00')
    )

    difference = planned_total - actual_total

    assigned_projects = [
        {'project_id': a.project_id, 'project_name': a.project.name}
        for a in assignments
    ]

    return {
        'month': month,
        'summary': {
            'planned_total': planned_total,
            'actual_total': actual_total,
            'difference': difference,
        },
        'assigned_projects': assigned_projects,
    }
