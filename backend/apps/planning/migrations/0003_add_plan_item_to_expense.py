# Generated migration for adding plan_item to Expense

from django.db import migrations, models
import django.db.models.deletion


def populate_plan_item_for_existing_expenses(apps, schema_editor):
    """Populate plan_item for existing expenses by linking to first available plan item from same plan_period."""
    Expense = apps.get_model('planning', 'Expense')
    PlanItem = apps.get_model('planning', 'PlanItem')
    
    # For each expense without a plan_item, try to find a plan item from the same plan_period
    expenses_without_plan_item = Expense.objects.filter(plan_item__isnull=True)
    expenses_that_cannot_be_populated = []
    
    for expense in expenses_without_plan_item:
        # Try to get the first plan item from the same plan_period
        plan_item = PlanItem.objects.filter(plan_period_id=expense.plan_period_id).first()
        if plan_item:
            expense.plan_item_id = plan_item.id
            expense.save(update_fields=['plan_item_id'])
        else:
            # Track expenses that cannot be populated
            expenses_that_cannot_be_populated.append(expense.id)
    
    # If there are expenses that cannot be populated, raise an error
    if expenses_that_cannot_be_populated:
        raise ValueError(
            f"Cannot populate plan_item for expenses with IDs: {expenses_that_cannot_be_populated}. "
            f"These expenses have no plan items in their plan_period. Please create plan items first or "
            f"manually assign plan_item to these expenses before running this migration."
        )


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0002_initial'),
    ]

    operations = [
        # Step 1: Add plan_item field as nullable
        migrations.AddField(
            model_name='expense',
            name='plan_item',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='expenses',
                to='planning.planitem',
                help_text='Plan item this expense is linked to'
            ),
        ),
        # Step 2: Populate plan_item for existing expenses
        migrations.RunPython(populate_plan_item_for_existing_expenses, migrations.RunPython.noop),
        # Step 3: Make plan_item non-nullable
        migrations.AlterField(
            model_name='expense',
            name='plan_item',
            field=models.ForeignKey(
                null=False,
                blank=False,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='expenses',
                to='planning.planitem',
                help_text='Plan item this expense is linked to'
            ),
        ),
        # Step 4: Add index
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['plan_item', 'spent_at'], name='planning_ex_plan_it_idx'),
        ),
        # Step 5: Update comment field to be required
        migrations.AlterField(
            model_name='expense',
            name='comment',
            field=models.TextField(
                blank=False,
                help_text='Comment is required'
            ),
        ),
    ]

