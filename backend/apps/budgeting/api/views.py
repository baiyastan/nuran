"""
Budgeting API views.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import ValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db import transaction
from core.permissions import IsAdmin, IsDirector
from apps.projects.models import ProjectAssignment
from apps.finance.services import assert_month_open_for_plans
from apps.finance.constants import MONTH_REQUIRED_MSG
from ..models import BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod, BudgetLine, BudgetExpense
from ..permissions import BudgetPlanPermission, BudgetLinePermission, BudgetExpensePermission, IsAdminOrReadOnly, ExpenseCategoryPermission
from .serializers import (
    BudgetPlanSummaryCommentUpdateSerializer, ExpenseCategorySerializer,
    BudgetPlanSerializer, BudgetLineSerializer, MonthPeriodSerializer, BudgetExpenseSerializer,
    BulkUpsertBudgetLinesSerializer,
)


def parse_month_yyyy_mm(raw: str) -> str:
    """
    Parse and validate a YYYY-MM month string.
    
    Raises DRF ValidationError with a consistent message on invalid format.
    """
    import re

    value = (raw or "").strip()
    if not re.match(r"^[0-9]{4}-[0-9]{2}$", value):
        raise ValidationError({"month": "Invalid format. Use YYYY-MM."})
    return value


class BudgetPlanViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetPlan - role-based access with submit/approve workflow.
    
    Important:
    - BudgetPlan identity is (period, scope) for all scopes.
    - The project field MUST always be null and is not part of the key.
    """
    
    queryset = BudgetPlan.objects.all()
    serializer_class = BudgetPlanSerializer
    permission_classes = [IsAuthenticated, BudgetPlanPermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['project', 'status', 'scope']

    def get_queryset(self):
        """Get queryset with role-based filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('period', 'project', 'approved_by')
        
        # Foreman: only PROJECT scope plans (permission ensures scope=PROJECT + has assignment)
        user = getattr(self.request, 'user', None)
        if user and user.is_authenticated and user.role == 'foreman':
            queryset = queryset.filter(scope='PROJECT')
        
        # Filter by month (period.month)
        month = self.request.query_params.get('month')
        if month:
            month_normalized = parse_month_yyyy_mm(month)
            queryset = queryset.filter(period__month=month_normalized)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Create or get existing BudgetPlan by (period, scope). Project is optional."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        validated_data = serializer.validated_data
        
        # Extract period - can be MonthPeriod instance/PK or month string (YYYY-MM)
        period = validated_data.get('period')
        if isinstance(period, str):
            month_str = parse_month_yyyy_mm(period)
            try:
                period_obj = MonthPeriod.objects.get(month=month_str)
            except MonthPeriod.DoesNotExist:
                raise ValidationError({'period': [MONTH_REQUIRED_MSG]})
        else:
            period_obj = period
        
        # Enforce month-level lock semantics for plan-side writes
        assert_month_open_for_plans(period_obj)
        
        project = validated_data.get('project')
        scope = validated_data.get('scope')
        
        with transaction.atomic():
            # BudgetPlan identity is (period, scope) for all scopes.
            # Project must always be null and is not part of the uniqueness key.
            if project is not None:
                raise ValidationError({'project': f'Project must be null when scope is {scope}'})
            
            budget_plan, created = BudgetPlan.objects.get_or_create(
                period=period_obj,
                scope=scope,
                defaults={
                    'project': None,
                    'status': validated_data.get('status', 'DRAFT'),
                },
            )
        
        serializer = self.get_serializer(budget_plan)
        headers = self.get_success_headers(serializer.data)
        if created:
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        return Response(serializer.data, status=status.HTTP_200_OK, headers=headers)
    
    def update(self, request, *args, **kwargs):
        """Update BudgetPlan."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # Enforce month-level lock semantics before any modifications
        assert_month_open_for_plans(instance.period)
        
        # Permissions handled by permission class (foreman has no access)
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
    
    def perform_destroy(self, instance):
        """Delete BudgetPlan - blocked when related month is locked or missing."""
        assert_month_open_for_plans(instance.period)
        super().perform_destroy(instance)
    
    @action(detail=True, methods=['patch'], url_path='summary-comment')
    def update_summary_comment(self, request, pk=None):
        """Create or update summary comment for a budget plan."""
        budget_plan = self.get_object()
        assert_month_open_for_plans(budget_plan.period)
        
        serializer = BudgetPlanSummaryCommentUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        comment_text = serializer.validated_data['comment_text']
        
        # Get or create summary comment
        summary_comment, created = BudgetPlanSummaryComment.objects.get_or_create(
            plan=budget_plan,
            defaults={
                'comment_text': comment_text,
                'updated_by': request.user,
            }
        )
        
        if not created:
            # Update existing comment
            summary_comment.comment_text = comment_text
            summary_comment.updated_by = request.user
            summary_comment.save()
        
        return Response({
            'id': summary_comment.id,
            'comment_text': summary_comment.comment_text,
            'updated_by': summary_comment.updated_by.username if summary_comment.updated_by else None,
            'updated_at': summary_comment.updated_at,
        }, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'], url_path='submit', permission_classes=[IsAuthenticated, IsDirector])
    def submit(self, request, pk=None):
        """Submit a budget plan (admin or director)."""
        budget_plan = self.get_object()
        assert_month_open_for_plans(budget_plan.period)
        
        if budget_plan.status != 'OPEN':
            return Response(
                {'error': f'Plan must be OPEN to submit. Current status: {budget_plan.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Validate at least one budget line exists
        if not BudgetLine.objects.filter(plan=budget_plan).exists():
            return Response(
                {'error': 'Cannot submit plan without at least one budget line.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Submit the plan
        budget_plan.status = 'SUBMITTED'
        budget_plan.submitted_at = timezone.now()
        budget_plan.save()
        
        serializer = self.get_serializer(budget_plan)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Approve a budget plan (admin only)."""
        budget_plan = self.get_object()
        assert_month_open_for_plans(budget_plan.period)
        
        # Check if user is admin
        if request.user.role != 'admin' and not request.user.is_superuser:
            return Response(
                {'error': 'Only admins can approve budget plans.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Validate plan status
        if budget_plan.status != 'SUBMITTED':
            return Response(
                {'error': f'Plan must be SUBMITTED to approve. Current status: {budget_plan.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Approve the plan
        budget_plan.status = 'APPROVED'
        budget_plan.approved_by = request.user
        budget_plan.approved_at = timezone.now()
        budget_plan.save()
        
        serializer = self.get_serializer(budget_plan)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['get'], url_path='report')
    def report(self, request, pk=None):
        """Get budget plan report with plan/fact/balance/percent."""
        from django.db.models import Sum
        
        budget_plan = self.get_object()
        
        # Get all budget lines grouped by category
        budget_lines = (
            BudgetLine.objects.filter(plan=budget_plan)
            .values('category')
            .annotate(planned=Sum('amount_planned'))
        )
        planned_by_category = {
            item['category']: float(item['planned']) for item in budget_lines
        }
        
        # Get all budget expenses grouped by category
        budget_expenses = (
            BudgetExpense.objects.filter(plan=budget_plan)
            .values('category')
            .annotate(spent=Sum('amount_spent'))
        )
        spent_by_category = {
            item['category']: float(item['spent']) for item in budget_expenses
        }
        
        # Get all unique category IDs
        all_category_ids = set(planned_by_category.keys()) | set(spent_by_category.keys())
        
        # Build rows
        rows = []
        for category_id in sorted(all_category_ids):
            try:
                category = ExpenseCategory.objects.get(pk=category_id)
            except ExpenseCategory.DoesNotExist:
                continue
            
            planned = planned_by_category.get(category_id, 0.0)
            spent = spent_by_category.get(category_id, 0.0)
            balance = planned - spent
            percent = (spent / planned * 100) if planned > 0 else None
            
            rows.append(
                {
                    'category_id': category_id,
                    'category_name': category.name,
                    'planned': round(planned, 2),
                    'spent': round(spent, 2),
                    'balance': round(balance, 2),
                    'percent': round(percent, 2) if percent is not None else None,
                }
            )
        
        # Calculate totals
        total_planned = float(sum(planned_by_category.values()))
        total_spent = float(sum(spent_by_category.values()))
        total_balance = float(total_planned - total_spent)
        total_percent = (
            (total_spent / total_planned * 100) if total_planned > 0 else None
        )
        
        return Response({
            'plan': {
                'id': budget_plan.id,
                'period_month': budget_plan.period.month,
                'project_name': budget_plan.project.name if budget_plan.project else None,
                'status': budget_plan.status,
            },
            'rows': rows,
            'totals': {
                'planned': round(total_planned, 2),
                'spent': round(total_spent, 2),
                'balance': round(total_balance, 2),
                'percent': round(total_percent, 2) if total_percent is not None else None,
            },
        }, status=status.HTTP_200_OK)


class BudgetLineViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetLine - role-based access with plan status validation."""
    
    queryset = BudgetLine.objects.all()
    serializer_class = BudgetLineSerializer
    permission_classes = [IsAuthenticated, BudgetLinePermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['plan', 'category']
    
    def get_queryset(self):
        """Get queryset with role-based filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('plan', 'plan__project', 'category', 'plan__period')
        
        # Admin and Director: see all lines (foreman has no access via permission)
        return queryset

    @action(detail=False, methods=['post'], url_path='bulk-upsert')
    def bulk_upsert(self, request):
        """Atomic bulk upsert of budget lines for a plan."""
        serializer = BulkUpsertBudgetLinesSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data
        plan = validated_data['plan']

        created = updated = deleted = 0
        with transaction.atomic():
            for item in validated_data['items']:
                category = item['category']
                amount_planned = item.get('amount_planned')
                note = item.get('note') or ''

                # Delete-on-zero: empty or 0 -> delete existing line
                if amount_planned is None or amount_planned == 0:
                    line = BudgetLine.objects.filter(plan=plan, category=category).first()
                    if line:
                        line.delete()
                        deleted += 1
                    continue

                line, was_created = BudgetLine.objects.get_or_create(
                    plan=plan,
                    category=category,
                    defaults={'amount_planned': amount_planned, 'note': note},
                )
                if was_created:
                    created += 1
                else:
                    line.amount_planned = amount_planned
                    line.note = note
                    line.save()
                    updated += 1

            lines = BudgetLine.objects.filter(plan=plan).select_related(
                'category', 'plan'
            ).order_by('category__name')
            lines_serializer = BudgetLineSerializer(lines, many=True)

        return Response({
            'plan': plan.id,
            'updated': updated,
            'created': created,
            'deleted': deleted,
            'lines': lines_serializer.data,
        }, status=status.HTTP_200_OK)

    def perform_create(self, serializer):
        """Create budget line (permission: admin only)."""
        plan = serializer.validated_data.get('plan') or getattr(serializer.instance, 'plan', None)
        if plan:
            assert_month_open_for_plans(plan.period)
        serializer.save()
    
    def perform_update(self, serializer):
        """Update budget line (permission: admin only)."""
        plan = serializer.validated_data.get('plan') or getattr(serializer.instance, 'plan', None)
        if plan:
            assert_month_open_for_plans(plan.period)
        serializer.save()
    
    def perform_destroy(self, instance):
        """Delete budget line (permission: admin only)."""
        assert_month_open_for_plans(instance.plan.period)
        instance.delete()


class BudgetExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetExpense - role-based access with plan status validation."""
    
    queryset = BudgetExpense.objects.all()
    serializer_class = BudgetExpenseSerializer
    permission_classes = [IsAuthenticated, BudgetExpensePermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['plan', 'category']
    
    def get_queryset(self):
        """Get queryset (foreman has no access via permission)."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('plan', 'plan__project', 'plan__period', 'category', 'created_by')
        
        # Filter by project (via plan__project)
        project = self.request.query_params.get('project')
        if project:
            queryset = queryset.filter(plan__project_id=project)
        
        # Filter by month (via plan__period__month)
        month = self.request.query_params.get('month')
        if month:
            queryset = queryset.filter(plan__period__month=month)
        
        return queryset
    
    def perform_create(self, serializer):
        """Create budget expense with auto-set created_by."""
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        """Update budget expense - blocked when related month is locked or missing."""
        plan = serializer.validated_data.get('plan') or getattr(serializer.instance, 'plan', None)
        if plan:
            assert_month_open_for_plans(plan.period)
        serializer.save()

    def perform_destroy(self, instance):
        """Delete budget expense - blocked when related month is locked or missing."""
        assert_month_open_for_plans(instance.plan.period)
        instance.delete()


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for ExpenseCategory."""
    
    queryset = ExpenseCategory.objects.all()  # Filtering handled in get_queryset()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [ExpenseCategoryPermission]
    
    def get_queryset(self):
        """Filter categories by scope, parent, is_active, and ordering."""
        # Start with all categories (not filtered by is_active yet)
        queryset = ExpenseCategory.objects.all()
        
        # Filter by is_active (default: show active only if not specified)
        is_active_param = self.request.query_params.get('is_active')
        if is_active_param is not None:
            if is_active_param.lower() == 'true':
                queryset = queryset.filter(is_active=True)
            elif is_active_param.lower() == 'false':
                queryset = queryset.filter(is_active=False)
        else:
            # Default: show active only
            queryset = queryset.filter(is_active=True)
        
        # Filter by scope
        scope = self.request.query_params.get('scope')
        if scope:
            queryset = queryset.filter(scope=scope)

        kind = self.request.query_params.get('kind')
        if kind:
            queryset = queryset.filter(kind=kind)
        
        # Filter by parent
        parent = self.request.query_params.get('parent')
        if parent is not None:
            if parent == 'null':
                queryset = queryset.filter(parent__isnull=True)
            else:
                try:
                    parent_id = int(parent)
                    queryset = queryset.filter(parent_id=parent_id)
                except ValueError:
                    pass

        is_system_root_param = self.request.query_params.get('is_system_root')
        if is_system_root_param is not None:
            if is_system_root_param.lower() == 'true':
                queryset = queryset.filter(is_system_root=True)
            elif is_system_root_param.lower() == 'false':
                queryset = queryset.filter(is_system_root=False)
        
        # Ordering
        ordering_param = self.request.query_params.get('ordering')
        if ordering_param:
            # Support explicit ordering param (e.g., ordering=name, ordering=-created_at)
            queryset = queryset.order_by(ordering_param)
        else:
            # Default ordering based on parent filter
            if parent == 'null':
                # Root categories: order by created_at ASC
                queryset = queryset.order_by('created_at')
            else:
                # Child categories: order by name ASC
                queryset = queryset.order_by('name')
        
        return queryset.select_related('parent')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Reserved for controlled bootstrap endpoints/commands only.
        context['allow_root_creation'] = False
        return context
    
    def perform_create(self, serializer):
        """Create category - validation handled by serializer (calls model.clean())."""
        serializer.save()
    
    def perform_update(self, serializer):
        """Update category - validation handled by serializer (calls model.clean())."""
        serializer.save()


class MonthPeriodViewSet(viewsets.ModelViewSet):
    """ViewSet for MonthPeriod - admin can manage, director/foreman read-only."""
    
    queryset = MonthPeriod.objects.all()
    serializer_class = MonthPeriodSerializer
    permission_classes = [IsAuthenticated, IsAdminOrReadOnly]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['month', 'status']
    # Use default lookup_field='pk' to support {id} in URLs for actions
    
    def get_queryset(self):
        """Get queryset ordered by month descending."""
        queryset = super().get_queryset()
        return queryset.order_by('-month')
    
    @action(detail=True, methods=['post'], url_path='open')
    def open(self, request, pk=None):
        """Open a month period (set status to OPEN)."""
        month_period = self.get_object()
        
        if month_period.status == 'OPEN':
            return Response(
                {'error': 'Month period status is already OPEN.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        month_period.status = 'OPEN'
        month_period.save()
        
        # Sync FinancePeriod status
        from apps.finance.services import FinancePeriodService
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        serializer = self.get_serializer(month_period)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'], url_path='unlock')
    def unlock(self, request, pk=None):
        """Unlock a month period (set status to OPEN)."""
        month_period = self.get_object()
        
        if month_period.status != 'LOCKED':
            return Response(
                {'error': f'Month period status is {month_period.status}. Only LOCKED periods can be unlocked.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        month_period.status = 'OPEN'
        month_period.save()
        
        # Sync FinancePeriod status
        from apps.finance.services import FinancePeriodService
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        serializer = self.get_serializer(month_period)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['post'], url_path='lock')
    def lock(self, request, pk=None):
        """Lock a month period (set status to LOCKED)."""
        month_period = self.get_object()
        
        if month_period.status != 'OPEN':
            return Response(
                {'error': f'Month period status is {month_period.status}. Only OPEN periods can be locked.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        month_period.status = 'LOCKED'
        month_period.save()
        
        # Sync FinancePeriod status
        from apps.finance.services import FinancePeriodService
        FinancePeriodService.sync_status_from_month_period(month_period)
        
        serializer = self.get_serializer(month_period)
        return Response(serializer.data, status=status.HTTP_200_OK)

