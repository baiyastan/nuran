"""
Management command to backfill category_id for ActualExpense records with null categories.

Usage:
    python manage.py backfill_expense_categories [--dry-run] [--batch-size=100]

This command:
- Finds all ActualExpense records where category_id IS NULL
- For each expense, determines scope from finance_period.fund_kind
- Tries to match expense.name to ExpenseCategory.name (case-insensitive)
- If no match found, assigns default "Башка" category for that scope
- Creates default "Башка" categories if they don't exist
- Safe to run multiple times (idempotent)
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from apps.planning.models import ActualExpense
from apps.budgeting.models import ExpenseCategory


class Command(BaseCommand):
    help = 'Backfill category_id for ActualExpense records with null categories'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without saving',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=100,
            help='Number of records to process in each batch (default: 100)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        batch_size = options['batch_size']

        # Find all expenses with null category
        expenses = ActualExpense.objects.filter(category__isnull=True).select_related('finance_period')
        total_count = expenses.count()

        if total_count == 0:
            self.stdout.write(self.style.SUCCESS('No expenses with null categories found.'))
            return

        self.stdout.write(f'Found {total_count} expenses with null categories.')

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be saved.'))

        # Map fund_kind to scope
        scope_map = {'project': 'project', 'office': 'office', 'charity': 'charity'}

        updated_count = 0
        created_default_count = 0
        matched_count = 0
        default_assigned_count = 0

        # Process in batches
        for i in range(0, total_count, batch_size):
            batch = expenses[i:i + batch_size]
            
            with transaction.atomic():
                for expense in batch:
                    # Determine scope from finance_period.fund_kind
                    fund_kind = expense.finance_period.fund_kind
                    scope = scope_map.get(fund_kind, 'project')

                    # Try to find matching category by name (case-insensitive)
                    normalized_name = expense.name.strip().lower()
                    category = ExpenseCategory.objects.filter(
                        scope=scope,
                        name__iexact=normalized_name,
                        is_active=True,
                        kind='EXPENSE'
                    ).first()

                    if category:
                        # Match found
                        if not dry_run:
                            expense.category = category
                            expense.save(update_fields=['category'])
                        matched_count += 1
                        self.stdout.write(
                            f'  Matched: "{expense.name}" → {category.name} (scope: {scope})'
                        )
                    else:
                        # No match, use default "Башка" category
                        default_category, created = ExpenseCategory.objects.get_or_create(
                            name='Башка',
                            scope=scope,
                            parent=None,
                            kind='EXPENSE',
                            defaults={'is_active': True}
                        )
                        
                        if created:
                            created_default_count += 1
                            self.stdout.write(
                                self.style.WARNING(
                                    f'  Created default category: "Башка" (scope: {scope})'
                                )
                            )
                        
                        if not dry_run:
                            expense.category = default_category
                            expense.save(update_fields=['category'])
                        default_assigned_count += 1
                        self.stdout.write(
                            f'  Default: "{expense.name}" → Башка (scope: {scope})'
                        )

                    updated_count += 1

            # Progress update
            self.stdout.write(f'Processed {min(i + batch_size, total_count)}/{total_count} expenses...')

        # Summary
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('Summary:'))
        self.stdout.write(f'  Total expenses processed: {updated_count}')
        self.stdout.write(f'  Matched by name: {matched_count}')
        self.stdout.write(f'  Assigned default category: {default_assigned_count}')
        self.stdout.write(f'  Default categories created: {created_default_count}')
        
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN - No changes were saved.'))
        else:
            self.stdout.write(self.style.SUCCESS('All expenses have been updated.'))

