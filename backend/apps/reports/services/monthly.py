"""Monthly plan vs fact report payload (ExpenseActualExpense actuals only)."""
from decimal import Decimal

from django.db.models import Count, Q, Sum

from apps.budgeting.models import BudgetLine, BudgetPlan, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense


def build_monthly_report_payload(
    month: str,
    scope: str,
    month_period: MonthPeriod,
    currency: str | None = None,
) -> dict:
    """
    Build response dict for MonthlyReportView.

    Actuals use only apps.expenses.ActualExpense for month_period + scope.
    """
    plan_ids = list(
        BudgetPlan.objects.filter(period=month_period, scope=scope).values_list('id', flat=True)
    )
    plan_id = plan_ids[0] if plan_ids else None

    planned_by_category = {}
    if plan_ids and currency != 'USD':
        lines = (
            BudgetLine.objects.filter(plan_id__in=plan_ids)
            .values('category_id', 'category__name')
            .annotate(planned=Sum('amount_planned'))
        )
        for row in lines:
            cid = row['category_id']
            planned_by_category[cid] = {
                'category_id': cid,
                'category_name': row['category__name'] or '',
                'planned': row['planned'],
            }

    actual_qs = ExpenseActualExpense.objects.filter(month_period=month_period, scope=scope)
    if currency in ('KGS', 'USD'):
        actual_qs = actual_qs.filter(currency=currency)

    stats = actual_qs.aggregate(
        s=Sum('amount'),
        facts_count=Count('id'),
        uncategorized_count=Count('id', filter=Q(category__isnull=True)),
    )
    facts_total_actual = float(stats['s'] or 0)
    facts_count = stats['facts_count'] or 0
    uncategorized_count = stats['uncategorized_count'] or 0

    actual_by_category = {}
    for row in actual_qs.values('category_id', 'category__name').annotate(total=Sum('amount')):
        cid = row['category_id']
        actual_by_category[cid] = {
            'category_id': cid,
            'category_name': (row['category__name'] or '') if cid is not None else 'Uncategorized',
            'total': row['total'] or Decimal('0.00'),
        }

    uncategorized_actual = actual_by_category.get(None, {}).get('total', Decimal('0.00'))
    uncategorized = {
        'planned': 0.0,
        'actual': float(uncategorized_actual),
        'delta': float(uncategorized_actual),
    }

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

    total_actual += uncategorized_actual

    rows.sort(key=lambda x: (-x['delta'], (x['category_name'] or '')))

    total_delta = total_actual - total_planned
    total_percent = float(total_actual / total_planned * 100) if total_planned > 0 else 0.0

    return {
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
    }
