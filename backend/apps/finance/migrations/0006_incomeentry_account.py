# Generated for audit: add destination account (Cash/Bank) to IncomeEntry

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0005_incomeentry_finance_inc_source__ff268c_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='incomeentry',
            name='account',
            field=models.CharField(
                choices=[('CASH', 'Cash'), ('BANK', 'Bank')],
                default='CASH',
                help_text='Destination account: Cash (кассага келди) or Bank (банкка келди)',
                max_length=10,
            ),
            preserve_default=False,
        ),
        migrations.AddIndex(
            model_name='incomeentry',
            index=models.Index(fields=['account'], name='finance_inc_account_idx'),
        ),
    ]
