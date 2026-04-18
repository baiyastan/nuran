from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finance', '0012_rename_finance_inc_currenc_idx_finance_inc_currenc_6ab0e1_idx_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='CurrencyExchange',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_account', models.CharField(choices=[('CASH', 'Cash'), ('BANK', 'Bank')], help_text='Account the source currency leaves', max_length=10)),
                ('source_currency', models.CharField(choices=[('KGS', 'KGS'), ('USD', 'USD')], help_text='Currency leaving the source account', max_length=3)),
                ('source_amount', models.DecimalField(decimal_places=2, help_text='Amount removed from the source account in source currency', max_digits=12)),
                ('destination_account', models.CharField(choices=[('CASH', 'Cash'), ('BANK', 'Bank')], help_text='Account the destination currency arrives in', max_length=10)),
                ('destination_currency', models.CharField(choices=[('KGS', 'KGS'), ('USD', 'USD')], help_text='Currency arriving in the destination account', max_length=3)),
                ('destination_amount', models.DecimalField(decimal_places=2, help_text='Amount credited to the destination account in destination currency', max_digits=12)),
                ('exchanged_at', models.DateField(help_text='Date of exchange')),
                ('comment', models.TextField(blank=True, help_text='Optional comment')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(help_text='User who created this exchange', null=True, on_delete=models.deletion.SET_NULL, related_name='created_currency_exchanges', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-exchanged_at', '-created_at'],
                'indexes': [
                    models.Index(fields=['exchanged_at'], name='finance_cur_exchang_idx1'),
                    models.Index(fields=['source_account', 'source_currency', 'exchanged_at'], name='finance_cur_src_idx'),
                    models.Index(fields=['destination_account', 'destination_currency', 'exchanged_at'], name='finance_cur_dst_idx'),
                ],
            },
        ),
    ]
