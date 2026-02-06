"""
Reports API views.
"""
from rest_framework import views
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from django.db.models import Sum, Q, F, DecimalField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from decimal import Decimal
from apps.planning.models import PlanItem, ProrabPlanItem, ActualExpense, PlanPeriod, ProrabPlan
from apps.budgeting.models import BudgetPlan, BudgetLine, ExpenseCategory, MonthPeriod
from .serializers import BudgetPlanReportSerializer


class PlanVsActualReportView(views.APIView):
    """Plan vs Actual comparison report."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get plan vs actual comparison report."""
        plan_period_id = request.query_params.get('plan_period_id')
        project_id = request.query_params.get('project_id')
        
        # Build base querysets
        plan_items = PlanItem.objects.all()
        actual_expenses = ActualExpense.objects.all()
        
        if plan_period_id:
            plan_items = plan_items.filter(plan_period_id=plan_period_id)
            # ActualExpense uses period FK, filter by it
            actual_expenses = actual_expenses.filter(period_id=plan_period_id)
        
        if project_id:
            plan_items = plan_items.filter(plan_period__project_id=project_id)
            actual_expenses = actual_expenses.filter(project_id=project_id)
        
        # Aggregate totals
        plan_total = plan_items.aggregate(total=Sum('amount'))['total'] or 0
        actual_total = actual_expenses.aggregate(total=Sum('amount'))['total'] or 0
        
        variance = actual_total - plan_total
        variance_percent = (variance / plan_total * 100) if plan_total > 0 else 0
        
        # Determine status
        if variance > 0:
            status = 'over'
        elif variance < 0:
            status = 'under'
        else:
            status = 'equal'
        
        return Response({
            'plan_total': float(plan_total),
            'actual_total': float(actual_total),
            'variance': float(variance),
            'variance_percent': round(variance_percent, 2),
            'status': status,
            'plan_period_id': plan_period_id,
            'project_id': project_id,
        })


class BudgetPlanReportView(views.APIView):
    """Budget plan report with planned vs actual comparison."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request, budget_id):
        """Get budget plan report."""
        budget_plan = get_object_or_404(BudgetPlan, pk=budget_id)
        
        # Calculate planned total from budget lines
        planned_total = BudgetLine.objects.filter(plan=budget_plan).aggregate(
            total=Sum('amount_planned')
        )['total'] or Decimal('0.00')
        
        # Get actual expenses for this budget plan
        # Match by period and scope/project
        actual_expenses_query = ActualExpense.objects.filter(
            spent_at__year=budget_plan.period.month[:4],
            spent_at__month=budget_plan.period.month[5:7]
        )
        
        if budget_plan.scope == 'OFFICE':
            # Office expenses - match by project name "Office"
            actual_expenses_query = actual_expenses_query.filter(
                project__name__iexact='Office'
            )
        else:
            # Project expenses - match by project
            if budget_plan.project:
                actual_expenses_query = actual_expenses_query.filter(
                    project=budget_plan.project
                )
            else:
                actual_expenses_query = actual_expenses_query.none()
        
        actual_expenses = actual_expenses_query.select_related(
            'project', 'created_by'
        ).order_by('-spent_at', '-created_at')
        
        # Calculate actual total
        actual_total = sum(expense.amount for expense in actual_expenses)
        
        # Calculate delta
        delta = actual_total - planned_total
        over_budget = delta > 0
        
        # Per-category breakdown
        budget_lines = BudgetLine.objects.filter(plan=budget_plan).select_related('category')
        per_category = []
        
        for line in budget_lines:
            # Get actual expenses for this category
            category_expenses = [
                exp for exp in actual_expenses
                # Note: ActualExpense doesn't have category FK yet, so we'll need to match by name or add FK
                # For now, we'll calculate total actual per category from budget lines
                # This is a simplified version - in production, ActualExpense should have category FK
            ]
            # Simplified: assume we can match expenses to categories somehow
            # For now, we'll show planned amounts and zero actuals
            category_actual = Decimal('0.00')  # Placeholder
            
            per_category.append({
                'category_id': line.category.id,
                'category_name': line.category.name,
                'planned': line.amount_planned,
                'actual': category_actual,
                'delta': category_actual - line.amount_planned,
            })
        
        # Expenses list
        expenses_list = [
            {
                'id': exp.id,
                'date': exp.spent_at,
                'category_name': exp.name,  # Using name as category placeholder
                'amount': exp.amount,
                'comment': exp.comment,
                'created_by': exp.created_by.username if exp.created_by else 'Unknown',
            }
            for exp in actual_expenses
        ]
        
        # Get summary comment
        summary_comment = None
        try:
            summary_comment_obj = budget_plan.summary_comment
            summary_comment = summary_comment_obj.comment_text
        except BudgetPlanSummaryComment.DoesNotExist:
            pass
        
        report_data = {
            'planned_total': planned_total,
            'actual_total': actual_total,
            'delta': delta,
            'over_budget': over_budget,
            'per_category': per_category,
            'expenses': expenses_list,
            'summary_comment': summary_comment,
        }
        
        serializer = BudgetPlanReportSerializer(data=report_data)
        serializer.is_valid(raise_exception=True)
        
        return Response(serializer.validated_data, status=status.HTTP_200_OK)


class MonthlyReportView(views.APIView):
    """Monthly budget report with plan vs actual aggregation by category."""
    
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get monthly report aggregated by category."""
        month = request.query_params.get('month')
        project_id = request.query_params.get('project')
        root_category_id = request.query_params.get('root_category')
        
        if not month:
            return Response(
                {'error': 'month parameter is required (format: YYYY-MM)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate month format
        try:
            year, month_num = month.split('-')
            int(year)
            int(month_num)
            if len(month) != 7:
                raise ValueError
        except (ValueError, AttributeError):
            return Response(
                {'error': 'month must be in format YYYY-MM (e.g., 2024-01)'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get or create MonthPeriod
        month_period, _ = MonthPeriod.objects.get_or_create(month=month)
        
        # Build base querysets
        budget_plans = BudgetPlan.objects.filter(period=month_period)
        actual_expenses = ActualExpense.objects.filter(
            spent_at__year=year,
            spent_at__month=month_num.zfill(2)
        )
        
        # Apply filters
        if root_category_id:
            try:
                root_category = ExpenseCategory.objects.get(
                    pk=root_category_id,
                    parent__isnull=True,
                    is_active=True
                )
                budget_plans = budget_plans.filter(root_category=root_category)
            except ExpenseCategory.DoesNotExist:
                return Response(
                    {'error': f'Root category {root_category_id} not found or is not a root category'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        if project_id:
            budget_plans = budget_plans.filter(project_id=project_id)
            actual_expenses = actual_expenses.filter(project_id=project_id)
        
        # Get all categories to aggregate
        categories = ExpenseCategory.objects.filter(is_active=True)
        
        # If root_category filter is applied, only get categories under that root
        if root_category_id:
            root_category = ExpenseCategory.objects.get(pk=root_category_id)
            # Get root category and all its descendants
            category_ids = [root_category.id]
            category_ids.extend(
                ExpenseCategory.objects.filter(
                    parent__in=category_ids
                ).values_list('id', flat=True)
            )
            # Recursively get all descendants
            while True:
                descendants = ExpenseCategory.objects.filter(
                    parent_id__in=category_ids
                ).exclude(id__in=category_ids).values_list('id', flat=True)
                if not descendants:
                    break
                category_ids.extend(descendants)
            categories = categories.filter(id__in=category_ids)
        
        # Aggregate planned amounts from BudgetLine
        budget_lines = BudgetLine.objects.filter(
            plan__in=budget_plans
        ).select_related('category', 'plan')
        
        # Aggregate planned amounts from ProrabPlanItem (if project mode)
        prorab_plan_items = ProrabPlanItem.objects.none()
        if project_id:
            # Get PlanPeriods for the project and month
            plan_periods = PlanPeriod.objects.filter(
                project_id=project_id,
                period=month
            )
            # Get ProrabPlans for these periods
            prorab_plans = ProrabPlan.objects.filter(
                period__in=plan_periods
            )
            prorab_plan_items = ProrabPlanItem.objects.filter(
                plan__in=prorab_plans
            ).select_related('category', 'plan')
        
        # Build category aggregation
        category_data = {}
        
        # Process BudgetLine planned amounts
        for line in budget_lines:
            category_id = line.category.id
            if category_id not in category_data:
                category_data[category_id] = {
                    'category_id': category_id,
                    'category_name': line.category.name,
                    'planned': Decimal('0.00'),
                    'actual': Decimal('0.00'),
                }
            category_data[category_id]['planned'] += line.amount_planned
        
        # Process ProrabPlanItem planned amounts
        for item in prorab_plan_items:
            category_id = item.category.id
            if category_id not in category_data:
                category_data[category_id] = {
                    'category_id': category_id,
                    'category_name': item.category.name,
                    'planned': Decimal('0.00'),
                    'actual': Decimal('0.00'),
                }
            category_data[category_id]['planned'] += item.amount
        
        # Process ActualExpense actual amounts (group by category)
        for expense in actual_expenses.select_related('category'):
            if expense.category:
                category_id = expense.category.id
                if category_id not in category_data:
                    category_data[category_id] = {
                        'category_id': category_id,
                        'category_name': expense.category.name,
                        'planned': Decimal('0.00'),
                        'actual': Decimal('0.00'),
                    }
                category_data[category_id]['actual'] += expense.amount
        
        # Calculate delta and percent for each category
        result_rows = []
        total_planned = Decimal('0.00')
        total_actual = Decimal('0.00')
        
        for cat_data in category_data.values():
            planned = cat_data['planned']
            actual = cat_data['actual']
            delta = actual - planned
            percent = (delta / planned * 100) if planned > 0 else Decimal('0.00')
            
            result_rows.append({
                'category_id': cat_data['category_id'],
                'category_name': cat_data['category_name'],
                'planned': float(planned),
                'actual': float(actual),
                'delta': float(delta),
                'percent': float(percent),
            })
            
            total_planned += planned
            total_actual += actual
        
        # Calculate totals
        total_delta = total_actual - total_planned
        total_percent = (total_delta / total_planned * 100) if total_planned > 0 else 0.0
        
        return Response({
            'month': month,
            'project_id': int(project_id) if project_id else None,
            'root_category_id': int(root_category_id) if root_category_id else None,
            'rows': sorted(result_rows, key=lambda x: x['category_name']),
            'totals': {
                'planned': float(total_planned),
                'actual': float(total_actual),
                'delta': float(total_delta),
                'percent': float(total_percent),
            }
        }, status=status.HTTP_200_OK)

