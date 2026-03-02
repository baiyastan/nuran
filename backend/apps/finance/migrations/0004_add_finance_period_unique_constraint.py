# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0003_incomeplan_incomesource_and_more'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='financeperiod',
            constraint=models.UniqueConstraint(
                fields=['month_period', 'fund_kind'],
                name='unique_finance_period_month_fund_kind'
            ),
        ),
    ]

