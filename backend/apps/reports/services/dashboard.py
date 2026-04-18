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

from django.db.models import Sum, Count, Q
from django.shortcuts import get_object_or_404

from apps.budgeting.models import BudgetLine, ExpenseCategory, MonthPeriod
from apps.expenses.models import ActualExpense as ExpenseActualExpense
from apps.finance.models import IncomeEntry, IncomePlan, IncomeSource, Transfer, CurrencyExchange
from apps.planning.models import ActualExpense as PlanningActualExpense

from .helpers import to_decimal_str


def build_dashboard_expense_categories_data(
    month: str,
    month_period: MonthPeriod,
    account: str | None = None,
    currency: str | None = None,
    start_date=None,
    end_date=None,
) -> dict[str, Any]:
    plan_by_category: dict[object, dict[str, object]] = {}
    if currency != 'USD':
        plan_qs = BudgetLine.objects.filter(
            plan__period=month_period,
        ).values('category_id', 'category__name').annotate(
            plan=Sum('amount_planned')
        )
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
    if start_date and end_date:
        fact_qs = fact_qs.filter(spent_at__gte=start_date, spent_at__lte=end_date)
    if account in ('CASH', 'BANK'):
        fact_qs = fact_qs.filter(account=account)
    if currency in ('KGS', 'USD'):
        fact_qs = fact_qs.filter(currency=currency)
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
    month: str,
    month_period: MonthPeriod,
    account: str | None = None,
    currency: str | None = None,
    start_date=None,
    end_date=None,
) -> dict[str, Any]:
    plan_by_source: dict[object, dict[str, object]] = {}
    if currency != 'USD':
        plan_qs = IncomePlan.objects.filter(
            period__month_period=month_period,
        ).values('source_id', 'source__name').annotate(
            plan=Sum('amount')
        )
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
    if start_date and end_date:
        fact_qs = fact_qs.filter(received_at__gte=start_date, received_at__lte=end_date)
    if account in ('CASH', 'BANK'):
        fact_qs = fact_qs.filter(account=account)
    if currency in ('KGS', 'USD'):
        fact_qs = fact_qs.filter(currency=currency)
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
    currency: str | None = None,
    start_date=None,
    end_date=None,
) -> dict[str, Any]:
    queryset = (
        IncomeEntry.objects.select_related('source')
        .filter(finance_period__month_period=month_period)
        .order_by('-received_at', '-created_at')
    )

    if account in ('CASH', 'BANK'):
        queryset = queryset.filter(account=account)
    if currency in ('KGS', 'USD'):
        queryset = queryset.filter(currency=currency)
    if start_date and end_date:
        queryset = queryset.filter(received_at__gte=start_date, received_at__lte=end_date)

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
        'period_label': f'{start_date.isoformat()} — {end_date.isoformat()}' if start_date and end_date else None,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': to_decimal_str(total_amount),
        'rows': [
            {
                'date': entry.received_at.strftime('%d.%m.%Y'),
                'account': entry.account,
                'currency': entry.currency,
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
    currency: str | None = None,
    start_date=None,
    end_date=None,
) -> dict[str, Any]:
    queryset = (
        ExpenseActualExpense.objects.select_related('category')
        .filter(month_period=month_period)
        .order_by('-spent_at', '-created_at')
    )

    if account in ('CASH', 'BANK'):
        queryset = queryset.filter(account=account)
    if currency in ('KGS', 'USD'):
        queryset = queryset.filter(currency=currency)
    if start_date and end_date:
        queryset = queryset.filter(spent_at__gte=start_date, spent_at__lte=end_date)

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
        'period_label': f'{start_date.isoformat()} — {end_date.isoformat()}' if start_date and end_date else None,
        'month_status': month_period.status,
        'item_name': item_name,
        'total_count': total_count,
        'total_amount': to_decimal_str(total_amount),
        'rows': [
            {
                'date': expense.spent_at.strftime('%d.%m.%Y'),
                'account': expense.account,
                'currency': expense.currency,
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
    Z = Decimal('0.00')

    def _z(value):
        return value if value is not None else Z

    income_agg = IncomeEntry.objects.filter(finance_period__month_period=month_period).aggregate(
        total=Sum('amount'),
        kgs=Sum('amount', filter=Q(currency='KGS')),
        usd=Sum('amount', filter=Q(currency='USD')),
    )
    income_total = _z(income_agg['total'])
    income_kgs = _z(income_agg['kgs'])
    income_usd = _z(income_agg['usd'])

    expense_agg = ExpenseActualExpense.objects.filter(month_period=month_period).aggregate(
        total=Sum('amount'),
        kgs=Sum('amount', filter=Q(currency='KGS')),
        usd=Sum('amount', filter=Q(currency='USD')),
    )
    expense_fact_total = _z(expense_agg['total'])
    expense_kgs = _z(expense_agg['kgs'])
    expense_usd = _z(expense_agg['usd'])

    planning_actual_expense_total = _z(
        PlanningActualExpense.objects.filter(finance_period__month_period=month_period)
        .aggregate(total=Sum('amount'))['total']
    )

    income_plan_total = _z(
        IncomePlan.objects.filter(period__month_period=month_period)
        .aggregate(total=Sum('amount'))['total']
    )

    expense_plan_total = _z(
        BudgetLine.objects.filter(plan__period=month_period)
        .aggregate(total=Sum('amount_planned'))['total']
    )

    net_total = income_total - expense_fact_total
    net_plan_total = income_plan_total - expense_plan_total

    def _month_flow(currency: str) -> dict:
        """Compute per-currency monthly cash/bank inflow, outflow, opening/closing balances.

        Each source table is hit exactly once per currency: a single aggregate with
        Sum(filter=Q(...)) computes opening, closing, and monthly bucketed sums in one pass.
        """
        try:
            year_int = int(month[:4])
            month_int = int(month[5:7])
            first_day = date(year_int, month_int, 1)
            last_day = date(year_int, month_int, calendar.monthrange(year_int, month_int)[1])
            prev_day = first_day - timedelta(days=1)
        except (ValueError, IndexError):
            return {k: Z for k in (
                'cash_opening', 'bank_opening', 'cash_closing', 'bank_closing',
                'cash_inflow', 'cash_outflow', 'bank_inflow', 'bank_outflow',
                'bank_to_cash', 'cash_to_bank',
            )}

        in_month = Q(received_at__gte=first_day)
        in_month_exp = Q(spent_at__gte=first_day)
        in_month_tr = Q(transferred_at__gte=first_day)
        in_month_ex = Q(exchanged_at__gte=first_day)
        before_open = Q(received_at__lte=prev_day)
        before_open_exp = Q(spent_at__lte=prev_day)
        before_open_tr = Q(transferred_at__lte=prev_day)
        before_open_ex = Q(exchanged_at__lte=prev_day)
        cash = Q(account='CASH')
        bank = Q(account='BANK')

        income = IncomeEntry.objects.filter(
            currency=currency, received_at__lte=last_day,
        ).aggregate(
            cash_close=Sum('amount', filter=cash),
            bank_close=Sum('amount', filter=bank),
            cash_open=Sum('amount', filter=cash & before_open),
            bank_open=Sum('amount', filter=bank & before_open),
            cash_month=Sum('amount', filter=cash & in_month),
            bank_month=Sum('amount', filter=bank & in_month),
        )

        exp = ExpenseActualExpense.objects.filter(
            currency=currency, spent_at__lte=last_day,
        ).aggregate(
            cash_close=Sum('amount', filter=cash),
            bank_close=Sum('amount', filter=bank),
            cash_open=Sum('amount', filter=cash & before_open_exp),
            bank_open=Sum('amount', filter=bank & before_open_exp),
            cash_month=Sum('amount', filter=cash & in_month_exp),
            bank_month=Sum('amount', filter=bank & in_month_exp),
        )

        cash_dst = Q(destination_account='CASH')
        bank_dst = Q(destination_account='BANK')
        cash_src = Q(source_account='CASH')
        bank_src = Q(source_account='BANK')

        tr = Transfer.objects.filter(
            currency=currency, transferred_at__lte=last_day,
        ).aggregate(
            cash_in_close=Sum('amount', filter=cash_dst),
            bank_in_close=Sum('amount', filter=bank_dst),
            cash_out_close=Sum('amount', filter=cash_src),
            bank_out_close=Sum('amount', filter=bank_src),
            cash_in_open=Sum('amount', filter=cash_dst & before_open_tr),
            bank_in_open=Sum('amount', filter=bank_dst & before_open_tr),
            cash_out_open=Sum('amount', filter=cash_src & before_open_tr),
            bank_out_open=Sum('amount', filter=bank_src & before_open_tr),
            cash_in_month=Sum('amount', filter=cash_dst & in_month_tr),
            bank_in_month=Sum('amount', filter=bank_dst & in_month_tr),
            cash_out_month=Sum('amount', filter=cash_src & in_month_tr),
            bank_out_month=Sum('amount', filter=bank_src & in_month_tr),
            bank_to_cash_month=Sum('amount', filter=bank_src & cash_dst & in_month_tr),
            cash_to_bank_month=Sum('amount', filter=cash_src & bank_dst & in_month_tr),
        )

        ex_in = CurrencyExchange.objects.filter(
            destination_currency=currency, exchanged_at__lte=last_day,
        ).aggregate(
            cash_close=Sum('destination_amount', filter=cash_dst),
            bank_close=Sum('destination_amount', filter=bank_dst),
            cash_open=Sum('destination_amount', filter=cash_dst & before_open_ex),
            bank_open=Sum('destination_amount', filter=bank_dst & before_open_ex),
            cash_month=Sum('destination_amount', filter=cash_dst & in_month_ex),
            bank_month=Sum('destination_amount', filter=bank_dst & in_month_ex),
        )

        ex_out = CurrencyExchange.objects.filter(
            source_currency=currency, exchanged_at__lte=last_day,
        ).aggregate(
            cash_close=Sum('source_amount', filter=cash_src),
            bank_close=Sum('source_amount', filter=bank_src),
            cash_open=Sum('source_amount', filter=cash_src & before_open_ex),
            bank_open=Sum('source_amount', filter=bank_src & before_open_ex),
            cash_month=Sum('source_amount', filter=cash_src & in_month_ex),
            bank_month=Sum('source_amount', filter=bank_src & in_month_ex),
        )

        return {
            'cash_opening': _z(income['cash_open']) - _z(exp['cash_open'])
                + _z(tr['cash_in_open']) - _z(tr['cash_out_open'])
                + _z(ex_in['cash_open']) - _z(ex_out['cash_open']),
            'bank_opening': _z(income['bank_open']) - _z(exp['bank_open'])
                + _z(tr['bank_in_open']) - _z(tr['bank_out_open'])
                + _z(ex_in['bank_open']) - _z(ex_out['bank_open']),
            'cash_closing': _z(income['cash_close']) - _z(exp['cash_close'])
                + _z(tr['cash_in_close']) - _z(tr['cash_out_close'])
                + _z(ex_in['cash_close']) - _z(ex_out['cash_close']),
            'bank_closing': _z(income['bank_close']) - _z(exp['bank_close'])
                + _z(tr['bank_in_close']) - _z(tr['bank_out_close'])
                + _z(ex_in['bank_close']) - _z(ex_out['bank_close']),
            'cash_inflow': _z(income['cash_month']) + _z(tr['cash_in_month']) + _z(ex_in['cash_month']),
            'cash_outflow': _z(exp['cash_month']) + _z(tr['cash_out_month']) + _z(ex_out['cash_month']),
            'bank_inflow': _z(income['bank_month']) + _z(tr['bank_in_month']) + _z(ex_in['bank_month']),
            'bank_outflow': _z(exp['bank_month']) + _z(tr['bank_out_month']) + _z(ex_out['bank_month']),
            'bank_to_cash': _z(tr['bank_to_cash_month']),
            'cash_to_bank': _z(tr['cash_to_bank_month']),
        }

    kgs = _month_flow('KGS')
    usd = _month_flow('USD')

    return {
        'month': month,
        # ── KGS totals (backward-compatible field names) ──
        'income_fact': to_decimal_str(income_total),
        'expense_fact': to_decimal_str(expense_fact_total),
        'planning_actual_expense_total': to_decimal_str(planning_actual_expense_total),
        'net': to_decimal_str(net_total),
        'income_plan': to_decimal_str(income_plan_total),
        'expense_plan': to_decimal_str(expense_plan_total),
        'net_plan': to_decimal_str(net_plan_total),
        # KGS account balances
        'cash_opening_balance': to_decimal_str(kgs['cash_opening']),
        'bank_opening_balance': to_decimal_str(kgs['bank_opening']),
        'cash_inflow_month': to_decimal_str(kgs['cash_inflow']),
        'cash_outflow_month': to_decimal_str(kgs['cash_outflow']),
        'bank_inflow_month': to_decimal_str(kgs['bank_inflow']),
        'bank_outflow_month': to_decimal_str(kgs['bank_outflow']),
        'cash_closing_balance': to_decimal_str(kgs['cash_closing']),
        'bank_closing_balance': to_decimal_str(kgs['bank_closing']),
        'cash_balance': to_decimal_str(kgs['cash_closing']),
        'bank_balance': to_decimal_str(kgs['bank_closing']),
        'bank_to_cash_month': to_decimal_str(kgs['bank_to_cash']),
        'cash_to_bank_month': to_decimal_str(kgs['cash_to_bank']),
        # ── USD balances ──
        'income_fact_usd': to_decimal_str(income_usd),
        'expense_fact_usd': to_decimal_str(expense_usd),
        'income_fact_kgs': to_decimal_str(income_kgs),
        'expense_fact_kgs': to_decimal_str(expense_kgs),
        'cash_balance_usd': to_decimal_str(usd['cash_closing']),
        'bank_balance_usd': to_decimal_str(usd['bank_closing']),
        'cash_closing_balance_usd': to_decimal_str(usd['cash_closing']),
        'bank_closing_balance_usd': to_decimal_str(usd['bank_closing']),
        'cash_opening_balance_usd': to_decimal_str(usd['cash_opening']),
        'bank_opening_balance_usd': to_decimal_str(usd['bank_opening']),
        'cash_inflow_month_usd': to_decimal_str(usd['cash_inflow']),
        'cash_outflow_month_usd': to_decimal_str(usd['cash_outflow']),
        'bank_inflow_month_usd': to_decimal_str(usd['bank_inflow']),
        'bank_outflow_month_usd': to_decimal_str(usd['bank_outflow']),
        'bank_to_cash_month_usd': to_decimal_str(usd['bank_to_cash']),
        'cash_to_bank_month_usd': to_decimal_str(usd['cash_to_bank']),
    }
