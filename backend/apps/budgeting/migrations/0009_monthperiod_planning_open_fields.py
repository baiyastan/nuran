from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0008_expensecategory_root_and_sibling_constraints'),
    ]

    operations = [
        migrations.AddField(
            model_name='monthperiod',
            name='planning_closed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='monthperiod',
            name='planning_open',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='monthperiod',
            name='planning_opened_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
