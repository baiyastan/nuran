# Generated manually for budgeting app refinement

from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('budgeting', '0002_add_root_category_to_budgetplan'),
    ]

    operations = [
        # Add 'charity' to ExpenseCategory.scope choices
        migrations.AlterField(
            model_name='expensecategory',
            name='scope',
            field=models.CharField(
                choices=[('project', 'Project'), ('office', 'Office'), ('charity', 'Charity')],
                default='project',
                help_text='Scope: project, office, or charity',
                max_length=20
            ),
        ),
        # Add kind field to ExpenseCategory
        migrations.AddField(
            model_name='expensecategory',
            name='kind',
            field=models.CharField(
                choices=[('EXPENSE', 'Expense'), ('INCOME', 'Income')],
                default='EXPENSE',
                help_text='Kind: EXPENSE or INCOME',
                max_length=20
            ),
        ),
        # Add index for kind field
        migrations.AddIndex(
            model_name='expensecategory',
            index=models.Index(fields=['kind', 'is_active'], name='budgeting_e_kind_is_a_idx'),
        ),
        # Add OPEN and SUBMITTED to BudgetPlan.status choices
        migrations.AlterField(
            model_name='budgetplan',
            name='status',
            field=models.CharField(
                choices=[
                    ('DRAFT', 'Draft'),
                    ('OPEN', 'Open'),
                    ('SUBMITTED', 'Submitted'),
                    ('APPROVED', 'Approved'),
                    ('CLOSED', 'Closed')
                ],
                default='DRAFT',
                max_length=20
            ),
        ),
        # Add CHARITY to BudgetPlan.scope choices
        migrations.AlterField(
            model_name='budgetplan',
            name='scope',
            field=models.CharField(
                choices=[('OFFICE', 'Office'), ('PROJECT', 'Project'), ('CHARITY', 'Charity')],
                help_text='OFFICE, PROJECT, or CHARITY (must match root_category.scope)',
                max_length=20
            ),
        ),
        # Add submitted_at field to BudgetPlan
        migrations.AddField(
            model_name='budgetplan',
            name='submitted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        # Remove old unique_together constraint
        migrations.AlterUniqueTogether(
            name='budgetplan',
            unique_together=set(),
        ),
        # Add new conditional unique constraints
        # Note: Django's UniqueConstraint with condition requires database support
        # For PostgreSQL, MySQL 8.0+, SQLite 3.8+ this works
        # If database doesn't support it, we'll need to handle uniqueness in application logic
        migrations.AddConstraint(
            model_name='budgetplan',
            constraint=models.UniqueConstraint(
                condition=Q(scope='PROJECT'),
                fields=['period', 'project'],
                name='unique_project_period'
            ),
        ),
        migrations.AddConstraint(
            model_name='budgetplan',
            constraint=models.UniqueConstraint(
                condition=Q(scope__in=['OFFICE', 'CHARITY']),
                fields=['period', 'root_category'],
                name='unique_office_charity_period'
            ),
        ),
    ]

