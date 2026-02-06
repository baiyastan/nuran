"""
Budgeting API views.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.utils import timezone
from django.db import transaction
from core.permissions import IsAdmin, IsDirector
from apps.projects.models import ProjectAssignment
from apps.planning.models import PlanPeriod
from ..models import BudgetPlan, BudgetPlanSummaryComment, ExpenseCategory, MonthPeriod, BudgetLine, BudgetExpense
from ..permissions import BudgetPlanPermission, BudgetLinePermission, BudgetExpensePermission
from .serializers import (
    BudgetPlanSummaryCommentUpdateSerializer, ExpenseCategorySerializer,
    BudgetPlanSerializer, BudgetLineSerializer, MonthPeriodSerializer, BudgetExpenseSerializer
)


class BudgetPlanViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetPlan - role-based access with submit/approve workflow."""
    
    queryset = BudgetPlan.objects.all()
    serializer_class = BudgetPlanSerializer
    permission_classes = [IsAuthenticated, BudgetPlanPermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['root_category', 'project', 'status']
    
    def get_queryset(self):
        """Get queryset with role-based filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('period', 'root_category', 'project', 'approved_by')
        
        # Role-based filtering
        user_role = self.request.user.role if self.request.user.is_authenticated else None
        
        # Foreman: only see plans for assigned projects
        if user_role == 'foreman':
            assigned_project_ids = ProjectAssignment.objects.filter(
                prorab=self.request.user
            ).values_list('project_id', flat=True)
            queryset = queryset.filter(project_id__in=assigned_project_ids)
        # Admin and Director: see all plans
        
        # Filter by month (period.month)
        month = self.request.query_params.get('month')
        if month:
            queryset = queryset.filter(period__month=month)
        
        return queryset
    
    def create(self, request, *args, **kwargs):
        """Create or get existing BudgetPlan by (period.month, root_category, project)."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        validated_data = serializer.validated_data
        
        # Extract period - can be period object or month string
        period = validated_data.get('period')
        if isinstance(period, str):
            # If period is a month string, get or create MonthPeriod
            period_obj, _ = MonthPeriod.objects.get_or_create(month=period)
        else:
            period_obj = period
        
        root_category = validated_data.get('root_category')
        project = validated_data.get('project')
        user_role = request.user.role if request.user.is_authenticated else None
        
        # Foreman validation - must happen before get_or_create
        if user_role == 'foreman':
            # Must be PROJECT scope
            scope = validated_data.get('scope')
            if scope != 'PROJECT':
                return Response(
                    {'error': 'Foremen can only create project plans.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Project must exist and foreman must be assigned
            if not project:
                return Response(
                    {'error': 'Project is required for foreman plan creation.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            if not ProjectAssignment.objects.filter(project=project, prorab=request.user).exists():
                return Response(
                    {'error': 'You are not assigned to this project.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # Check that PlanPeriod exists and is open for this project and month
            plan_period = PlanPeriod.objects.filter(
                project=project,
                period=period_obj.month
            ).first()
            
            if not plan_period:
                return Response(
                    {'error': f'Cannot create plan. Month {period_obj.month} has not been opened for this project by admin.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            if plan_period.status != 'open':
                return Response(
                    {'error': f'Cannot create plan. Month period status is {plan_period.status}. Period must be open.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            # MonthPeriod must be OPEN
            if period_obj.status != 'OPEN':
                return Response(
                    {'error': f'Cannot create plan. Month period status is {period_obj.status}. Period must be OPEN.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Set status to OPEN for foreman-created plans
            validated_data['status'] = 'OPEN'
        
        # Get or create BudgetPlan
        with transaction.atomic():
            budget_plan, created = BudgetPlan.objects.get_or_create(
                period=period_obj,
                root_category=root_category,
                project=project,
                defaults={
                    'scope': validated_data.get('scope'),
                    'status': validated_data.get('status', 'DRAFT'),
                }
            )
            
            # If not created, update fields that can be updated
            if not created:
                # Update scope if provided and different
                if 'scope' in validated_data and budget_plan.scope != validated_data['scope']:
                    budget_plan.scope = validated_data['scope']
                    budget_plan.save()
        
        serializer = self.get_serializer(budget_plan)
        headers = self.get_success_headers(serializer.data)
        
        if created:
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)
        else:
            return Response(serializer.data, status=status.HTTP_200_OK, headers=headers)
    
    def update(self, request, *args, **kwargs):
        """Update BudgetPlan - foreman can only update when status is OPEN."""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        
        # Check permissions (handled by permission class, but validate status for foreman)
        if request.user.role == 'foreman' and instance.status != 'OPEN':
            return Response(
                {'error': f'Cannot update plan. Plan status must be OPEN. Current status: {instance.status}'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        
        return Response(serializer.data)
    
    def partial_update(self, request, *args, **kwargs):
        """Partial update BudgetPlan - foreman can only update when status is OPEN."""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
    
    @action(detail=True, methods=['patch'], url_path='summary-comment')
    def update_summary_comment(self, request, pk=None):
        """Create or update summary comment for a budget plan."""
        budget_plan = self.get_object()
        
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
    
    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """Submit a budget plan (foreman only)."""
        budget_plan = self.get_object()
        
        # Check if user is foreman
        if request.user.role != 'foreman':
            return Response(
                {'error': 'Only foremen can submit budget plans.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Check if foreman is assigned to the project
        if budget_plan.project:
            if not ProjectAssignment.objects.filter(
                project=budget_plan.project,
                prorab=request.user
            ).exists():
                return Response(
                    {'error': 'You are not assigned to this project.'},
                    status=status.HTTP_403_FORBIDDEN
                )
        else:
            # Office/charity plans: foreman cannot submit
            return Response(
                {'error': 'Foremen can only submit project plans.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Validate plan status
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
        from django.db.models import Sum, Q
        from decimal import Decimal
        
        budget_plan = self.get_object()
        
        # Get all budget lines grouped by category
        budget_lines = BudgetLine.objects.filter(plan=budget_plan).values('category').annotate(
            planned=Sum('amount_planned')
        )
        planned_by_category = {item['category']: float(item['planned']) for item in budget_lines}
        
        # Get all budget expenses grouped by category
        budget_expenses = BudgetExpense.objects.filter(plan=budget_plan).values('category').annotate(
            spent=Sum('amount_spent')
        )
        spent_by_category = {item['category']: float(item['spent']) for item in budget_expenses}
        
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
            
            rows.append({
                'category_id': category_id,
                'category_name': category.name,
                'planned': str(Decimal(str(planned)).quantize(Decimal('0.01'))),
                'spent': str(Decimal(str(spent)).quantize(Decimal('0.01'))),
                'balance': str(Decimal(str(balance)).quantize(Decimal('0.01'))),
                'percent': round(percent, 2) if percent is not None else None,
            })
        
        # Calculate totals
        total_planned = sum(planned_by_category.values())
        total_spent = sum(spent_by_category.values())
        total_balance = total_planned - total_spent
        total_percent = (total_spent / total_planned * 100) if total_planned > 0 else None
        
        return Response({
            'plan': {
                'id': budget_plan.id,
                'period_month': budget_plan.period.month,
                'project_name': budget_plan.project.name if budget_plan.project else None,
                'status': budget_plan.status,
            },
            'rows': rows,
            'totals': {
                'planned': str(Decimal(str(total_planned)).quantize(Decimal('0.01'))),
                'spent': str(Decimal(str(total_spent)).quantize(Decimal('0.01'))),
                'balance': str(Decimal(str(total_balance)).quantize(Decimal('0.01'))),
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
        
        # Role-based filtering
        user_role = self.request.user.role if self.request.user.is_authenticated else None
        
        # Foreman: only see lines for assigned projects
        if user_role == 'foreman':
            assigned_project_ids = ProjectAssignment.objects.filter(
                prorab=self.request.user
            ).values_list('project_id', flat=True)
            queryset = queryset.filter(plan__project_id__in=assigned_project_ids)
        # Admin and Director: see all lines
        
        return queryset
    
    def perform_create(self, serializer):
        """Create budget line with validation."""
        plan = serializer.validated_data.get('plan')
        user_role = self.request.user.role
        
        # Admin: always allowed
        if user_role == 'admin' or self.request.user.is_superuser:
            serializer.save()
            return
        
        # Foreman: only if plan.status == OPEN and assigned to project
        if user_role == 'foreman':
            if plan.status != 'OPEN':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'plan': f'Cannot add budget line. Plan status must be OPEN. Current status: {plan.status}'
                })
            
            # Check if foreman is assigned to the project
            if plan.project:
                if not ProjectAssignment.objects.filter(
                    project=plan.project,
                    prorab=self.request.user
                ).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You are not assigned to this project.')
            else:
                # Office/charity plans: foreman cannot create lines
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Foremen can only add lines to project plans.')
        
        serializer.save()
    
    def perform_update(self, serializer):
        """Update budget line - admin always allowed, foreman only when plan status is OPEN."""
        user_role = self.request.user.role
        instance = serializer.instance if serializer.instance else self.get_object()
        plan = instance.plan
        
        # Admin: always allowed
        if user_role == 'admin' or self.request.user.is_superuser:
            serializer.save()
            return
        
        # Foreman: only if plan.status == OPEN and assigned to project
        if user_role == 'foreman':
            if plan.status != 'OPEN':
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(f'Cannot update budget line. Plan status must be OPEN. Current status: {plan.status}')
            
            # Check if foreman is assigned to the project
            if plan.project:
                if not ProjectAssignment.objects.filter(
                    project=plan.project,
                    prorab=self.request.user
                ).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You are not assigned to this project.')
            else:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Foremen can only update lines in project plans.')
            
            serializer.save()
            return
        
        # Director and others: not allowed
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You do not have permission to update budget lines.')
    
    def perform_destroy(self, instance):
        """Delete budget line - admin always allowed, foreman only when plan status is OPEN."""
        user_role = self.request.user.role
        plan = instance.plan
        
        # Admin: always allowed
        if user_role == 'admin' or self.request.user.is_superuser:
            instance.delete()
            return
        
        # Foreman: only if plan.status == OPEN and assigned to project
        if user_role == 'foreman':
            if plan.status != 'OPEN':
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied(f'Cannot delete budget line. Plan status must be OPEN. Current status: {plan.status}')
            
            # Check if foreman is assigned to the project
            if plan.project:
                if not ProjectAssignment.objects.filter(
                    project=plan.project,
                    prorab=self.request.user
                ).exists():
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied('You are not assigned to this project.')
            else:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Foremen can only delete lines in project plans.')
            
            instance.delete()
            return
        
        # Director and others: not allowed
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('You do not have permission to delete budget lines.')


class BudgetExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for BudgetExpense - role-based access with plan status validation."""
    
    queryset = BudgetExpense.objects.all()
    serializer_class = BudgetExpenseSerializer
    permission_classes = [IsAuthenticated, BudgetExpensePermission]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['plan', 'category']
    
    def get_queryset(self):
        """Get queryset with role-based filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('plan', 'plan__project', 'plan__period', 'category', 'created_by')
        
        # Role-based filtering
        user_role = self.request.user.role if self.request.user.is_authenticated else None
        
        # Foreman: only see expenses for assigned projects
        if user_role == 'foreman':
            assigned_project_ids = ProjectAssignment.objects.filter(
                prorab=self.request.user
            ).values_list('project_id', flat=True)
            queryset = queryset.filter(plan__project_id__in=assigned_project_ids)
        # Admin and Director: see all expenses
        
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


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """ViewSet for ExpenseCategory."""
    
    queryset = ExpenseCategory.objects.all()  # Filtering handled in get_queryset()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsAuthenticated]
    
    def get_permissions(self):
        """Admin only for create/update/delete, authenticated for read."""
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), IsAdmin()]
        return [IsAuthenticated()]
    
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
    
    def perform_create(self, serializer):
        """Create category - validation handled by serializer (calls model.clean())."""
        serializer.save()
    
    def perform_update(self, serializer):
        """Update category - validation handled by serializer (calls model.clean())."""
        serializer.save()


class MonthPeriodViewSet(viewsets.ModelViewSet):
    """ViewSet for MonthPeriod - admin/director can manage month periods."""
    
    queryset = MonthPeriod.objects.all()
    serializer_class = MonthPeriodSerializer
    permission_classes = [IsAuthenticated, IsDirector]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['month', 'status']
    lookup_field = 'month'
    lookup_value_regex = r'[0-9]{4}-[0-9]{2}'  # YYYY-MM format
    
    def get_queryset(self):
        """Get queryset ordered by month descending."""
        queryset = super().get_queryset()
        return queryset.order_by('-month')
    
    def get_object(self):
        """Get object by month string instead of ID."""
        month = self.kwargs.get('month')
        if month:
            obj = MonthPeriod.objects.filter(month=month).first()
            if not obj:
                from rest_framework.exceptions import NotFound
                raise NotFound(f'MonthPeriod with month={month} not found.')
            self.check_object_permissions(self.request, obj)
            return obj
        return super().get_object()
    
    @action(detail=True, methods=['patch'], url_path='unlock')
    def unlock(self, request, month=None):
        """Unlock a month period (set status to OPEN)."""
        month_period = self.get_object()
        
        if month_period.status != 'LOCKED':
            return Response(
                {'error': f'Month period status is {month_period.status}. Only LOCKED periods can be unlocked.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        month_period.status = 'OPEN'
        month_period.save()
        
        serializer = self.get_serializer(month_period)
        return Response(serializer.data, status=status.HTTP_200_OK)
    
    @action(detail=True, methods=['patch'], url_path='lock')
    def lock(self, request, month=None):
        """Lock a month period (set status to LOCKED)."""
        month_period = self.get_object()
        
        if month_period.status != 'OPEN':
            return Response(
                {'error': f'Month period status is {month_period.status}. Only OPEN periods can be locked.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        month_period.status = 'LOCKED'
        month_period.save()
        
        serializer = self.get_serializer(month_period)
        return Response(serializer.data, status=status.HTTP_200_OK)

