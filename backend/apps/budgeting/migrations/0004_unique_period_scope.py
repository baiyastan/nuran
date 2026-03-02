# BudgetPlan: one plan per (period, scope); project no longer part of key

from django.db import migrations, models


def dedupe_plans_by_period_scope(apps, schema_editor):
    """Keep one BudgetPlan per (period_id, scope); delete duplicates (CASCADE removes lines/expenses)."""
    BudgetPlan = apps.get_model('budgeting', 'BudgetPlan')
    from django.db.models import Min, Count
    duplicates = (
        BudgetPlan.objects.values('period_id', 'scope')
        .annotate(cnt=Count('id'), keep_id=Min('id'))
        .filter(cnt__gt=1)
    )
    for row in duplicates:
        keep_id = row['keep_id']
        BudgetPlan.objects.filter(period_id=row['period_id'], scope=row['scope']).exclude(pk=keep_id).delete()


def noop_backward(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0003_normalize_monthperiod_data'),
    ]

    operations = [
        migrations.RunPython(dedupe_plans_by_period_scope, noop_backward),
        migrations.RemoveConstraint(
            model_name='budgetplan',
            name='unique_project_period',
        ),
        migrations.RemoveConstraint(
            model_name='budgetplan',
            name='unique_office_charity_period',
        ),
        migrations.AddConstraint(
            model_name='budgetplan',
            constraint=models.UniqueConstraint(fields=('period', 'scope'), name='unique_period_scope'),
        ),
    ]
