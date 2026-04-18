from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0006_report_query_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='actualexpense',
            name='currency',
            field=models.CharField(
                choices=[('KGS', 'KGS'), ('USD', 'USD')],
                default='KGS',
                help_text='Currency of the expense amount (KGS or USD)',
                max_length=3,
            ),
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(fields=['currency'], name='expenses_ac_currenc_idx'),
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(
                fields=['account', 'currency', 'spent_at'],
                name='expenses_ac_acc_cur_spnt_idx',
            ),
        ),
    ]
