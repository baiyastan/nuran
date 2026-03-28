"""
Dashboard-oriented aggregates: KPIs, expense/income breakdowns, PDF drill-down row data.

Semantics are unchanged from the original views module:
- expense_fact side uses apps.expenses.models.ActualExpense only.
- planning_actual_expense_total uses apps.planning.models.ActualExpense only.
"""
import calendar
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Sum, Count
from django.shortcuts import get_object_or_404

from apps.budgeting.models import BudgetLine, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.models import IncomeEntry, IncomePlan, IncomeSource, Transfer
from apps.planning.models import ActualExpense as PlanningActualExpense

from .helpers import to_decimal_str


def build_dashboard_expense_categories_data(
    month: str, month_period: MonthPeriod, account: str | None = None
) -> dict[str, Any]:
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
    )
    if account in ('CASH', 'BANK'):
        fact_qs = fact_qs.filter(account=account)
    fact_qs = fact_qs.values('category_id', 'category__name').annotate(
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

    if account in ('CASH', 'BANK'):
        rows = [r for r in rows if r['fact'] != Decimal('0.00') or r['count'] != 0]

    if account in ('CASH', 'BANK'):
        total_plan = sum(r['plan'] for r in rows)
        total_fact = sum(r['fact'] for r in rows)

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
            'plan': to_decimal_str(row['plan']),
            'fact': to_decimal_str(row['fact']),
            'diff': to_decimal_str(row['diff']),
            'count': row['count'],
            'sharePercent': row['sharePercent'],
        }
        for row in rows
    ]

    return {
        'month': month,
        'month_status': month_period.status,
        'totals': {
            'plan': to_decimal_str(total_plan),
            'fact': to_decimal_str(total_fact),
        },
        'rows': serialized_rows,
    }


def build_dashboard_income_sources_data(
    month: str, month_period: MonthPeriod, account: str | None = None
) -> dict[str, Any]:
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
    )
    if account in ('CASH', 'BANK'):
        fact_qs = fact_qs.filter(account=account)
    fact_qs = fact_qs.values('source_id', 'source__name').annotate(
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

    if account in ('CASH', 'BANK'):
        rows = [r for r in rows if r['fact'] != Decimal('0.00') or r['count'] != 0]

    if account in ('CASH', 'BANK'):
        total_plan = sum(r['plan'] for r in rows)
        total_fact = sum(r['fact'] for r in rows)

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
            'plan': to_decimal_str(row['plan']),
            'fact': to_decimal_str(row['fact']),
            'diff': to_decimal_str(row['diff']),
            'count': row['count'],
            'sharePercent': row['sharePercent'],
        }
        for row in rows
    ]

    return {
        'month': month,
        'month_status': month_period.status,
        'totals': {
            'plan': to_decimal_str(total_plan),
            'fact': to_decimal_str(total_fact),
        },
        'rows': serialized_rows,
    }


def build_income_source_detail_pdf_data(
    month: str,
    month_period: MonthPeriod,
    source_id: int | None,
    is_uncategorized: bool,
    account: str | None = None,
) -> dict[str, Any]:
    queryset = (
        IncomeEntry.objects.select_related('source')
        .filter(finance_period__month_period=month_period)
        .order_by('-received_at', '-created_at')
    )

    if account in ('CASH', 'BANK'):
        queryset = queryset.filter(account=account)

    if is_uncategorized:
        queryset = queryset.filter(source__isnull=True)
        item_name = 'Без источника'
    else:
        source = get_object_or_404(IncomeSource, pk=source_id)
        queryset = queryset.filter(source_id=source.id)
        item_name = source.name

    entries = list(queryset)
    total_count = len(entries)
    total_amount = sum((e.amount for e in entries), Decimal('0.00'))

    return {
        'month': month,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': to_decimal_str(total_amount),
        'rows': [
            {
                'date': entry.received_at.strftime('%d.%m.%Y'),
                'account': entry.account,
                'amount': to_decimal_str(entry.amount),
                'name': entry.source.name if entry.source else '',
                'comment': entry.comment,
            }
            for entry in entries
        ],
    }


def build_expense_category_detail_pdf_data(
    month: str,
    month_period: MonthPeriod,
    category_id: int | None,
    is_uncategorized: bool,
    account: str | None = None,
) -> dict[str, Any]:
    queryset = (
        ExpenseActualExpense.objects.select_related('category')
        .filter(month_period=month_period)
        .order_by('-spent_at', '-created_at')
    )

    if account in ('CASH', 'BANK'):
        queryset = queryset.filter(account=account)

    if is_uncategorized:
        queryset = queryset.filter(category__isnull=True)
        item_name = 'Без категории'
    else:
        category = get_object_or_404(ExpenseCategory, pk=category_id)
        queryset = queryset.filter(category_id=category.id)
        item_name = category.name

    expenses = list(queryset)
    total_count = len(expenses)
    total_amount = sum((e.amount for e in expenses), Decimal('0.00'))

    return {
        'month': month,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': to_decimal_str(total_amount),
        'rows': [
            {
                'date': expense.spent_at.strftime('%d.%m.%Y'),
                'account': expense.account,
                'amount': to_decimal_str(expense.amount),
                'name': expense.category.name if expense.category else '',
                'comment': expense.comment,
            }
            for expense in expenses
        ],
    }


def build_dashboard_kpi_response_data(month: str, month_period: MonthPeriod) -> dict[str, str]:
    """
    Build the JSON body for DashboardKpiView (all string decimals).

    expense_fact: ExpenseActualExpense only.
    planning_actual_expense_total: PlanningActualExpense only.
    net: income_fact - expense_fact.
    """
    from apps.expenses.services import get_balance_for_account

    income_qs = IncomeEntry.objects.filter(
        finance_period__month_period=month_period,
    )
    income_total = income_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    expense_qs = ExpenseActualExpense.objects.filter(
        month_period=month_period,
    )
    expense_fact_total = expense_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    planning_expense_qs = PlanningActualExpense.objects.filter(
        finance_period__month_period=month_period,
    )
    planning_actual_expense_total = (
        planning_expense_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    )

    income_plan_qs = IncomePlan.objects.filter(
        period__month_period=month_period,
    )
    income_plan_total = income_plan_qs.aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

    expense_plan_qs = BudgetLine.objects.filter(
        plan__period=month_period,
    )
    expense_plan_total = expense_plan_qs.aggregate(total=Sum('amount_planned'))['total'] or Decimal('0.00')

    net_total = income_total - expense_fact_total
    net_plan_total = income_plan_total - expense_plan_total

    try:
        year_int = int(month[:4])
        month_int = int(month[5:7])
        first_day = date(year_int, month_int, 1)
        last_day = date(year_int, month_int, calendar.monthrange(year_int, month_int)[1])
        prev_day = first_day.replace(day=1) - timedelta(days=1)
    except (ValueError, IndexError):
        cash_opening_balance = Decimal('0.00')
        bank_opening_balance = Decimal('0.00')
        cash_closing_balance = Decimal('0.00')
        bank_closing_balance = Decimal('0.00')
        cash_inflow_month = Decimal('0.00')
        cash_outflow_month = Decimal('0.00')
        bank_inflow_month = Decimal('0.00')
        bank_outflow_month = Decimal('0.00')
        bank_to_cash_month = Decimal('0.00')
        cash_to_bank_month = Decimal('0.00')
    else:
        cash_opening_balance = get_balance_for_account('CASH', prev_day)
        bank_opening_balance = get_balance_for_account('BANK', prev_day)
        cash_closing_balance = get_balance_for_account('CASH', last_day)
        bank_closing_balance = get_balance_for_account('BANK', last_day)

        bank_to_cash_month = (
            Transfer.objects.filter(
                source_account='BANK',
                destination_account='CASH',
                transferred_at__gte=first_day,
                transferred_at__lte=last_day,
            ).aggregate(t=Sum('amount'))['t']
            or Decimal('0.00')
        )
        cash_to_bank_month = (
            Transfer.objects.filter(
                source_account='CASH',
                destination_account='BANK',
                transferred_at__gte=first_day,
                transferred_at__lte=last_day,
            ).aggregate(t=Sum('amount'))['t']
            or Decimal('0.00')
        )

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

    cash_balance = cash_closing_balance
    bank_balance = bank_closing_balance

    return {
        'month': month,
        'income_fact': to_decimal_str(income_total),
        'expense_fact': to_decimal_str(expense_fact_total),
        'planning_actual_expense_total': to_decimal_str(planning_actual_expense_total),
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
        'bank_to_cash_month': to_decimal_str(bank_to_cash_month),
        'cash_to_bank_month': to_decimal_str(cash_to_bank_month),
    }
