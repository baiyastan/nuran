# Generated migration for adding finance_actual_expense OneToOneField to Expense

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0005_rename_planning_ex_plan_it_idx_planning_ex_plan_it_829e84_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='finance_actual_expense',
            field=models.OneToOneField(
                blank=True,
                help_text='Linked Finance ActualExpense (synced automatically)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='planning_expense',
                to='planning.actualexpense'
            ),
        ),
    ]

