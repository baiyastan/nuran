# Data migration: normalize MonthPeriod.month to YYYY-MM and status to OPEN/LOCKED

import re
from django.db import migrations


def normalize_month(value):
    """Convert YYYY-MM-DD to YYYY-MM; ensure YYYY-MM format."""
    if not value:
        return value
    s = (value or '').strip()
    if re.match(r'^\d{4}-\d{2}-\d{2}', s):
        return s[:7]
    if re.match(r'^\d{4}-\d{2}$', s):
        return s
    if len(s) >= 7 and re.match(r'^\d{4}-\d{2}', s):
        return s[:7]
    return s


def normalize_status(value):
    """Convert open/locked to OPEN/LOCKED."""
    if value is None:
        return 'OPEN'
    s = (value or '').strip().lower()
    if s == 'open':
        return 'OPEN'
    if s == 'locked':
        return 'LOCKED'
    return 'OPEN'


def forward(apps, schema_editor):
    MonthPeriod = apps.get_model('budgeting', 'MonthPeriod')
    BudgetPlan = apps.get_model('budgeting', 'BudgetPlan')
    # FinancePeriod and PlanPeriod may be in other apps
    try:
        FinancePeriod = apps.get_model('finance', 'FinancePeriod')
    except LookupError:
        FinancePeriod = None
    try:
        PlanPeriod = apps.get_model('planning', 'PlanPeriod')
    except LookupError:
        PlanPeriod = None

    all_periods = list(MonthPeriod.objects.all())
    by_normalized = {}
    for mp in all_periods:
        nmonth = normalize_month(mp.month)
        nstatus = normalize_status(mp.status)
        key = nmonth
        if key not in by_normalized:
            by_normalized[key] = []
        by_normalized[key].append((mp, nmonth, nstatus))

    # Resolve duplicates: keep one MonthPeriod per normalized month, reassign FKs from others
    id_to_keep = {}
    ids_to_remove = []
    for nmonth, group in by_normalized.items():
        if len(group) == 1:
            id_to_keep[group[0][0].id] = (group[0][1], group[0][2])
            continue
        # Prefer the row that already has month length 7 (canonical), else smallest id
        group_sorted = sorted(
            group,
            key=lambda x: (0 if len(x[0].month) == 7 and re.match(r'^\d{4}-\d{2}$', x[0].month) else 1, x[0].id)
        )
        keeper = group_sorted[0][0]
        keep_nmonth, keep_nstatus = group_sorted[0][1], group_sorted[0][2]
        id_to_keep[keeper.id] = (keep_nmonth, keep_nstatus)
        for mp, _, _ in group_sorted[1:]:
            ids_to_remove.append((mp.id, keeper.id))

    # Reassign FKs from removed periods to the kept period
    for old_id, new_id in ids_to_remove:
        BudgetPlan.objects.filter(period_id=old_id).update(period_id=new_id)
        if FinancePeriod:
            FinancePeriod.objects.filter(month_period_id=old_id).update(month_period_id=new_id)
        if PlanPeriod:
            PlanPeriod.objects.filter(month_period_id=old_id).update(month_period_id=new_id)

    # Delete duplicate MonthPeriods
    for old_id, _ in ids_to_remove:
        MonthPeriod.objects.filter(pk=old_id).delete()

    # Update remaining rows to normalized month and status (use update to avoid model save/clean)
    for pk, (nmonth, nstatus) in id_to_keep.items():
        MonthPeriod.objects.filter(pk=pk).update(month=nmonth, status=nstatus)


def backward(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0002_initial'),
        ('finance', '0001_initial'),
        ('planning', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
