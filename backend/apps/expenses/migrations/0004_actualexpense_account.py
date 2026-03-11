# Add source account (Cash/Bank) to ActualExpense - кассадан кетти / банктан кетти

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_month_period_scope_replace_finance_period'),
    ]

    operations = [
        migrations.AddField(
            model_name='actualexpense',
            name='account',
            field=models.CharField(
                choices=[('CASH', 'Cash'), ('BANK', 'Bank')],
                default='CASH',
                help_text='Source account: Cash (кассадан кетти) or Bank (банктан кетти)',
                max_length=10,
            ),
            preserve_default=False,
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(fields=['account'], name='expenses_ac_account_idx'),
        ),
    ]
