from django.core.management.base import BaseCommand
from django.db import transaction

from apps.budgeting.models import ExpenseCategory
from apps.budgeting.services.category_bootstrap import CANONICAL_ROOTS


class Command(BaseCommand):
    help = 'Repoint children from duplicate roots to canonical root and deactivate duplicates.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply changes. Without this flag, command is dry-run.',
        )

    def _resolve_canonical_root(self, scope):
        canonical_name = CANONICAL_ROOTS[scope]
        canonical = (
            ExpenseCategory.objects.filter(
                scope=scope,
                parent__isnull=True,
                name=canonical_name,
            )
            .order_by('id')
            .first()
        )
        warning = None
        if canonical is None:
            canonical = (
                ExpenseCategory.objects.filter(scope=scope, parent__isnull=True, is_active=True)
                .order_by('created_at', 'id')
                .first()
            )
            if canonical:
                warning = (
                    f'Canonical name "{canonical_name}" not found for scope={scope}. '
                    f'Fallback to oldest active root id={canonical.id}.'
                )
        return canonical, warning

    def handle(self, *args, **options):
        apply_changes = options['apply']
        mode = 'APPLY' if apply_changes else 'DRY-RUN'
        self.stdout.write(self.style.WARNING(f'Running in {mode} mode'))

        stats = {
            'moved_children': 0,
            'deactivated_roots': 0,
            'scopes_processed': 0,
        }

        for scope in ('office', 'project', 'charity'):
            canonical, warning = self._resolve_canonical_root(scope)
            if warning:
                self.stdout.write(self.style.WARNING(warning))
            if canonical is None:
                self.stdout.write(
                    self.style.ERROR(f'No root found for scope={scope}. Skipping scope.')
                )
                continue

            self.stdout.write(
                f'scope={scope} canonical_root id={canonical.id} name="{canonical.name}"'
            )
            duplicates = ExpenseCategory.objects.filter(
                scope=scope,
                parent__isnull=True,
            ).exclude(pk=canonical.pk)
            if not duplicates.exists():
                self.stdout.write('  no duplicates')
                stats['scopes_processed'] += 1
                continue

            with transaction.atomic():
                for dup in duplicates.order_by('created_at', 'id'):
                    child_qs = ExpenseCategory.objects.filter(parent=dup)
                    child_count = child_qs.count()
                    self.stdout.write(
                        f'  duplicate id={dup.id} name="{dup.name}" children={child_count}'
                    )
                    if apply_changes:
                        moved = child_qs.update(parent=canonical)
                        stats['moved_children'] += moved
                        if dup.is_active:
                            dup.is_active = False
                            dup.save(update_fields=['is_active', 'updated_at'])
                            stats['deactivated_roots'] += 1
                    else:
                        stats['moved_children'] += child_count
                        if dup.is_active:
                            stats['deactivated_roots'] += 1

            stats['scopes_processed'] += 1

        self.stdout.write('')
        self.stdout.write('Summary:')
        self.stdout.write(f"  scopes_processed={stats['scopes_processed']}")
        self.stdout.write(f"  children_to_move={stats['moved_children']}")
        self.stdout.write(f"  roots_to_deactivate={stats['deactivated_roots']}")

