from django.core.management.base import BaseCommand

from apps.budgeting.models import BudgetPlan
from apps.planning.models import PlanPeriod


class Command(BaseCommand):
    help = "Audit legacy planning/budget rows before data cleanup rollout."

    def handle(self, *args, **options):
        plan_period_null_month = PlanPeriod.objects.filter(month_period__isnull=True).count()
        budget_plan_draft = BudgetPlan.objects.filter(status='DRAFT').count()
        plan_period_legacy_open = PlanPeriod.objects.filter(status='open').count()

        self.stdout.write(f"PlanPeriod rows with NULL month_period: {plan_period_null_month}")
        self.stdout.write(f"BudgetPlan rows in DRAFT: {budget_plan_draft}")
        self.stdout.write(f"PlanPeriod rows in legacy open status: {plan_period_legacy_open}")
