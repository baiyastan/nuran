from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0010_report_query_indexes'),
    ]

    operations = [
        migrations.AddField(
            model_name='incomeentry',
            name='currency',
            field=models.CharField(
                choices=[('KGS', 'KGS'), ('USD', 'USD')],
                default='KGS',
                help_text='Currency of the income amount (KGS or USD)',
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name='transfer',
            name='currency',
            field=models.CharField(
                choices=[('KGS', 'KGS'), ('USD', 'USD')],
                default='KGS',
                help_text='Currency of the transfer (KGS or USD)',
                max_length=3,
            ),
        ),
        migrations.AddIndex(
            model_name='incomeentry',
            index=models.Index(fields=['currency'], name='finance_inc_currenc_idx'),
        ),
        migrations.AddIndex(
            model_name='incomeentry',
            index=models.Index(
                fields=['account', 'currency', 'received_at'],
                name='finance_inc_acc_cur_rcvd_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='transfer',
            index=models.Index(fields=['currency'], name='finance_tr_currenc_idx'),
        ),
    ]
