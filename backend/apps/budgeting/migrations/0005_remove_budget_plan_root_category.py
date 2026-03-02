# Remove root_category from BudgetPlan; plan key is (period, scope) only

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0004_unique_period_scope'),
    ]

    operations = [
        migrations.RemoveIndex(
            model_name='budgetplan',
            name='budgeting_b_period__3073da_idx',
        ),
        migrations.RemoveField(
            model_name='budgetplan',
            name='root_category',
        ),
    ]
