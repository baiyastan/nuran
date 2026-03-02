# Generated migration for removing name field from Expense

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('planning', '0003_add_plan_item_to_expense'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='expense',
            name='name',
        ),
    ]


