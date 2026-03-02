# Generated manually for expenses.ActualExpense

import django.core.validators
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('finance', '0004_add_finance_period_unique_constraint'),
        ('budgeting', '0002_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='ActualExpense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, help_text='Amount spent in KGS', max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))])),
                ('spent_at', models.DateField(help_text='Date when money was spent')),
                ('comment', models.TextField(help_text='Required comment for every expense')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('category', models.ForeignKey(blank=True, help_text='Expense category (optional)', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='expense_actual_expenses', to='budgeting.expensecategory')),
                ('created_by', models.ForeignKey(help_text='User who created this expense', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_expense_actual_expenses', to=settings.AUTH_USER_MODEL)),
                ('finance_period', models.ForeignKey(help_text='Finance period (required)', on_delete=django.db.models.deletion.CASCADE, related_name='expense_actual_expenses', to='finance.financeperiod')),
            ],
            options={
                'ordering': ['-spent_at', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(fields=['finance_period', 'spent_at'], name='expenses_act_finance_abc123_idx'),
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(fields=['category'], name='expenses_act_catego_def456_idx'),
        ),
        migrations.AddIndex(
            model_name='actualexpense',
            index=models.Index(fields=['spent_at'], name='expenses_act_spent__ghi789_idx'),
        ),
    ]
