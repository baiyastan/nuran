# Generated manually to fix unique constraint and add kind validation

from django.db import migrations, models
from django.db.models import Q, Count


def check_for_duplicates(apps, schema_editor):
    """Check for duplicate BudgetPlan entries before changing constraint."""
    BudgetPlan = apps.get_model('budgeting', 'BudgetPlan')
    
    # Find duplicates by (period, scope) for OFFICE/CHARITY
    # These would violate the new constraint (period, scope)
    duplicates = BudgetPlan.objects.filter(
        scope__in=['OFFICE', 'CHARITY']
    ).values('period', 'scope').annotate(
        count=Count('id')
    ).filter(count__gt=1)
    
    if duplicates.exists():
        dup_list = list(duplicates)
        # Get detailed info about duplicates
        details = []
        for dup in dup_list:
            plans = BudgetPlan.objects.filter(
                scope__in=['OFFICE', 'CHARITY'],
                period_id=dup['period'],
                scope=dup['scope']
            ).values('id', 'scope', 'period__month', 'root_category__name', 'created_at').order_by('created_at')
            details.append({
                'period_id': dup['period'],
                'scope': dup['scope'],
                'count': dup['count'],
                'plans': list(plans)
            })
        
        raise migrations.MigrationError(
            f"Found {len(dup_list)} duplicate BudgetPlan entries for OFFICE/CHARITY scopes "
            f"that would violate the new unique constraint (period, scope). "
            f"For each month, there must be at most one OFFICE plan and at most one CHARITY plan. "
            f"Please resolve duplicates before running migration.\n\n"
            f"Duplicate details: {details}"
        )


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0003_add_charity_scope_kind_and_workflow'),
    ]

    operations = [
        # Check for duplicates before removing old constraint
        migrations.RunPython(check_for_duplicates, migrations.RunPython.noop),
        # Remove old unique constraint (period, root_category) for OFFICE/CHARITY
        migrations.RemoveConstraint(
            model_name='budgetplan',
            name='unique_office_charity_period',
        ),
        # Add new unique constraint (period, scope) for OFFICE/CHARITY
        # This ensures one plan per period per scope (OFFICE or CHARITY)
        migrations.AddConstraint(
            model_name='budgetplan',
            constraint=models.UniqueConstraint(
                condition=Q(scope__in=['OFFICE', 'CHARITY']),
                fields=['period', 'scope'],
                name='unique_office_charity_period'
            ),
        ),
    ]

