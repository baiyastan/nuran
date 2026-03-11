# Internal transfer between Cash and Bank (not income, not expense)

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0006_incomeentry_account'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Transfer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source_account', models.CharField(
                    choices=[('CASH', 'Cash'), ('BANK', 'Bank')],
                    help_text='Source account: Cash or Bank (where money leaves)',
                    max_length=10,
                )),
                ('destination_account', models.CharField(
                    choices=[('CASH', 'Cash'), ('BANK', 'Bank')],
                    help_text='Destination account: Cash or Bank (where money arrives)',
                    max_length=10,
                )),
                ('amount', models.DecimalField(decimal_places=2, help_text='Amount transferred', max_digits=12)),
                ('transferred_at', models.DateField(help_text='Date of transfer')),
                ('comment', models.TextField(blank=True, help_text='Optional comment')),
                ('created_by', models.ForeignKey(
                    help_text='User who created this transfer',
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='created_transfers',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-transferred_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='transfer',
            index=models.Index(fields=['transferred_at'], name='finance_tra_transfe_idx'),
        ),
        migrations.AddIndex(
            model_name='transfer',
            index=models.Index(fields=['source_account', 'destination_account'], name='finance_tra_source__idx'),
        ),
    ]
