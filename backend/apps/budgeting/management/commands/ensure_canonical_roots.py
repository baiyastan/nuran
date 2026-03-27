from django.core.management.base import BaseCommand

from apps.budgeting.services.category_bootstrap import ensure_canonical_expense_roots


class Command(BaseCommand):
    help = 'Ensure canonical system expense roots exist for office/project/charity scopes.'

    def handle(self, *args, **options):
        rows = ensure_canonical_expense_roots()
        for row in rows:
            status = 'created' if row['created'] else 'resolved'
            self.stdout.write(
                f"[{status}] scope={row['scope']} id={row['id']} name={row['name']}"
            )

