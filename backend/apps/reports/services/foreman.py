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
    currency: str | None = None,
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

    if currency == 'USD':
        planned_total = Decimal('0.00')
    else:
        planned_total = (
            BudgetLine.objects.filter(
                plan__period=month_period,
                plan__scope='PROJECT',
            ).aggregate(total=Sum('amount_planned'))['total']
            or Decimal('0.00')
        )

    actual_qs = ExpenseActualExpense.objects.filter(
        month_period=month_period,
        scope='PROJECT',
    )
    if currency in ('KGS', 'USD'):
        actual_qs = actual_qs.filter(currency=currency)

    actual_total = (
        actual_qs.aggregate(total=Sum('amount'))['total']
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
