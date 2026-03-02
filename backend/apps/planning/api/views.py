"""
Planning API views.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.filters import SearchFilter, OrderingFilter
from rest_framework.exceptions import ValidationError as DRFValidationError, PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from core.exceptions import (
    InvalidApprovalStage, ForbiddenError, NotEditableError,
    PeriodClosedError, LimitExceededError
)
from apps.finance.constants import MONTH_REQUIRED_MSG
from ..models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense, Expense
from ..services import PlanPeriodService, PlanItemService, ProrabPlanService, ActualExpenseService, ExpenseService, PlanningExpenseActualExpenseSyncService, assert_plan_editing_allowed
from apps.finance.services import assert_month_open
from .serializers import (
    PlanPeriodSerializer, PlanItemSerializer,
    ProjectAssignmentSerializer, ProrabPlanPeriodSerializer,
    ProrabPlanSerializer, ProrabPlanItemSerializer,
    ActualExpenseSerializer, ProrabPlanSummarySerializer, ProrabPlanExpenseSerializer,
    ProrabProjectSerializer, ExpenseSerializer,
)
from ..permissions import PlanPeriodPermission, PlanItemPermission, ProrabPlanPermission, ActualExpensePermission, ExpensePermission
from ..filters import PlanItemFilter
from apps.projects.models import ProjectAssignment, Project
from apps.projects.api.serializers import ProjectSerializer


class PlanPeriodViewSet(viewsets.ModelViewSet):
    """ViewSet for PlanPeriod."""
    
    queryset = PlanPeriod.objects.all()
    serializer_class = PlanPeriodSerializer
    permission_classes = [PlanPeriodPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['project', 'status', 'period', 'fund_kind']
    search_fields = ['period', 'comments']
    ordering_fields = ['period', 'created_at', 'updated_at']
    ordering = ['-period', '-created_at']
    
    def get_queryset(self):
        """Get queryset with optional filtering."""
        queryset = super().get_queryset()
        queryset = queryset.select_related('project', 'created_by')
        
        # Foreman can only see plan periods for assigned projects
        if self.request.user.role == 'foreman':
            queryset = queryset.filter(
                project__assignments__prorab=self.request.user
            ).distinct()
        
        return queryset
    
    def perform_create(self, serializer):
        """Create plan period with audit logging."""
        # Validate unique constraints before creation
        fund_kind = serializer.validated_data.get('fund_kind')
        period = serializer.validated_data.get('period')
        project = serializer.validated_data.get('project')
        user = self.request.user
        
        # Foreman can only create project plans for assigned projects
        if user.role == 'foreman':
            if fund_kind != 'project':
                raise PermissionDenied('Foreman can only create project plans. Office/charity plans are not allowed.')
            if not project:
                raise PermissionDenied('Project is required for foreman plan creation.')
            if not ProjectAssignment.objects.filter(project=project, prorab=user).exists():
                raise PermissionDenied("You don't have access to this project.")
        
        if fund_kind == 'project':
            if not project:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'project': 'Project is required when fund_kind is "project"'})
            # Check unique constraint: (project, period) for project fund_kind
            if PlanPeriod.objects.filter(project=project, period=period, fund_kind='project').exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'non_field_errors': [f'Plan period already exists for project {project.name} and period {period}']
                })
        elif fund_kind in ('office', 'charity'):
            # Check unique constraint: (fund_kind, period) for office/charity
            if PlanPeriod.objects.filter(fund_kind=fund_kind, period=period).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    'non_field_errors': [f'Plan period already exists for {fund_kind} and period {period}']
                })
        
        service = PlanPeriodService()
        try:
            plan_period = service.create(
                user=self.request.user,
                **serializer.validated_data
            )
        except DjangoValidationError as exc:
            message = str(exc)
            if MONTH_REQUIRED_MSG in message:
                # Surface missing MonthPeriod as a field-specific API error.
                raise DRFValidationError({'period': [MONTH_REQUIRED_MSG]})
            # Fallback: preserve error details as non-field error.
            raise DRFValidationError({'non_field_errors': [message]})

        serializer.instance = plan_period
    
    def perform_update(self, serializer):
        """Update plan period with audit logging and month lock check."""
        plan_period = serializer.instance
        user = self.request.user

        # Foreman: can only update project plans for assigned projects
        if user.role == 'foreman':
            # Merge validated_data with instance to get effective values after update
            effective_fund_kind = serializer.validated_data.get('fund_kind', plan_period.fund_kind)
            effective_project = serializer.validated_data.get('project', plan_period.project)
            if effective_project is None and 'project' in serializer.validated_data:
                effective_project = serializer.validated_data['project']

            if effective_fund_kind != 'project':
                raise PermissionDenied('Foreman can only update project plans. Office/charity plans are not allowed.')
            if not effective_project:
                raise PermissionDenied('Project is required for foreman plan update.')
            if not ProjectAssignment.objects.filter(project=effective_project, prorab=user).exists():
                raise PermissionDenied("You don't have access to this project.")

        service = PlanPeriodService()
        plan_period = service.update(
            plan_period=plan_period,
            user=user,
            **serializer.validated_data
        )
        serializer.instance = plan_period

    def perform_destroy(self, instance):
        """Delete plan period with foreman access check."""
        user = self.request.user

        # Foreman: can only delete project plans for assigned projects
        if user.role == 'foreman':
            if instance.fund_kind != 'project':
                raise PermissionDenied('Foreman can only delete project plans. Office/charity plans are not allowed.')
            if not instance.project:
                raise PermissionDenied('Foreman cannot delete plan periods without a project.')
            if not ProjectAssignment.objects.filter(project=instance.project, prorab=user).exists():
                raise PermissionDenied("You don't have access to this project.")

        instance.delete()
    
    @action(detail=True, methods=['post'], url_path='submit')
    def submit(self, request, pk=None):
        """Submit a plan period for approval."""
        plan_period = self.get_object()
        self.check_object_permissions(request, plan_period)
        service = PlanPeriodService()
        
        try:
            plan_period = service.submit(plan_period, request.user)
            serializer = self.get_serializer(plan_period)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a plan period."""
        plan_period = self.get_object()
        self.check_object_permissions(request, plan_period)
        service = PlanPeriodService()
        comments = request.data.get('comments', '')
        
        try:
            plan_period = service.approve(plan_period, request.user, comments)
            serializer = self.get_serializer(plan_period)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        """Lock a plan period."""
        plan_period = self.get_object()
        self.check_object_permissions(request, plan_period)
        service = PlanPeriodService()
        
        try:
            plan_period = service.lock(plan_period, request.user)
            serializer = self.get_serializer(plan_period)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        """Unlock a plan period."""
        # Fetch object directly to avoid queryset filtering issues
        plan_period = get_object_or_404(PlanPeriod.objects.all(), pk=pk)
        # Explicitly check object permissions to enforce RBAC
        self.check_object_permissions(request, plan_period)
        
        try:
            plan_period.status = 'open'
            plan_period.save(update_fields=['status'])
            serializer = self.get_serializer(plan_period)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class PlanItemViewSet(viewsets.ModelViewSet):
    """ViewSet for PlanItem."""
    
    queryset = PlanItem.objects.all()
    serializer_class = PlanItemSerializer
    permission_classes = [PlanItemPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = PlanItemFilter
    search_fields = ['title', 'category', 'note']
    ordering_fields = ['created_at', 'amount']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Get queryset with optimized queries."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'plan_period',
            'plan_period__project',
            'created_by'
        )
        
        # Foreman can only see plan items from assigned projects (exclude office/charity)
        # Only filter if assignments exist for projects (backward compatibility)
        if self.request.user.role == 'foreman':
            from apps.projects.models import ProjectAssignment
            # Check if any projects have assignments at all
            has_any_assignments = ProjectAssignment.objects.exists()
            if has_any_assignments:
                # If assignments exist, filter by assignment
                queryset = queryset.filter(
                    plan_period__fund_kind='project',
                    plan_period__project__assignments__prorab=self.request.user
                ).distinct()
            else:
                # If no assignments exist, allow foreman to see all project plan items (backward compatibility)
                queryset = queryset.filter(plan_period__fund_kind='project')
        
        return queryset
    
    def perform_create(self, serializer):
        """Create plan item with audit logging."""
        user = self.request.user
        plan_period = serializer.validated_data.get('plan_period')
        
        # Defense-in-depth: check month period lock status
        if plan_period:
            month_period = plan_period.month_period
            assert_plan_editing_allowed(month_period, user)
        
        # Defense-in-depth: foreman validation
        if user.role == 'foreman':
            if not plan_period:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'plan_period': 'Plan period is required'})
            
            # Reject if fund_kind is not 'project'
            if plan_period.fund_kind != 'project':
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'plan_period': 'Foreman can only create plan items for project plans'})
            
            # Reject if project is null
            if not plan_period.project:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'plan_period': 'Foreman can only create plan items for project plans with an assigned project'})
            
            # Verify foreman is assigned to the project
            if not ProjectAssignment.objects.filter(project=plan_period.project, prorab=user).exists():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'plan_period': 'You are not assigned to this project'})
        
        service = PlanItemService()
        plan_item = service.create(
            user=user,
            **serializer.validated_data
        )
        serializer.instance = plan_item
    
    def perform_update(self, serializer):
        """Update plan item with audit logging."""
        # Defense-in-depth: check month period lock status
        plan_item = serializer.instance
        if plan_item.plan_period:
            month_period = plan_item.plan_period.month_period
            assert_plan_editing_allowed(month_period, self.request.user)
        
        service = PlanItemService()
        service.update(
            plan_item=plan_item,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete plan item with audit logging."""
        # Defense-in-depth: check month period lock status
        if instance.plan_period:
            month_period = instance.plan_period.month_period
            assert_plan_editing_allowed(month_period, self.request.user)
        
        service = PlanItemService()
        service.delete(plan_item=instance, user=self.request.user)


class ProrabProjectsViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing projects assigned to the current prorab."""
    
    serializer_class = ProrabProjectSerializer
    permission_classes = [ProrabPlanPermission]
    
    def get_queryset(self):
        """Get projects assigned to the current prorab."""
        return Project.objects.filter(
            assignments__prorab=self.request.user
        ).distinct().select_related('created_by').prefetch_related('assignments').exclude(name__iexact='office')
    
    def get_serializer_context(self):
        """Add request to serializer context for assigned_at calculation."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class ProrabPlanPeriodsViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for listing plan periods for a specific project."""
    
    serializer_class = ProrabPlanPeriodSerializer
    permission_classes = [ProrabPlanPermission]
    
    def get_queryset(self):
        """Get plan periods for the project assigned to the current prorab."""
        project_id = self.kwargs.get('project_id')
        
        # Verify prorab is assigned to this project
        is_assigned = ProjectAssignment.objects.filter(
            project_id=project_id,
            prorab=self.request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        return PlanPeriod.objects.filter(
            project_id=project_id
        ).select_related('project').order_by('-period')


class ProrabPlanViewSet(viewsets.ModelViewSet):
    """ViewSet for ProrabPlan - auto-creates DRAFT if missing."""
    
    serializer_class = ProrabPlanSerializer
    permission_classes = [ProrabPlanPermission]
    
    def get_queryset(self):
        """Get plans for the current prorab."""
        return ProrabPlan.objects.filter(
            prorab=self.request.user
        ).select_related('period', 'period__project', 'prorab').prefetch_related('items')
    
    def retrieve(self, request, *args, **kwargs):
        """Get plan for a period, auto-create DRAFT if missing."""
        period_id = kwargs.get('pk')
        
        try:
            period = PlanPeriod.objects.get(pk=period_id)
        except PlanPeriod.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(detail='Plan period not found')
        
        # Verify assignment
        is_assigned = ProjectAssignment.objects.filter(
            project=period.project,
            prorab=request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Get or create plan
        plan = ProrabPlanService.get_or_create_plan(period, request.user)
        
        serializer = self.get_serializer(plan)
        return Response(serializer.data)
    
    def create(self, request, *args, **kwargs):
        """Create is handled by retrieve (auto-create)."""
        from rest_framework.exceptions import MethodNotAllowed
        raise MethodNotAllowed('POST', detail='Use GET to retrieve/create plan')
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """Get plan summary with planned/spent/remaining totals."""
        # Fetch object directly to avoid queryset filtering issues
        plan = get_object_or_404(ProrabPlan.objects.all(), pk=pk)
        # Explicitly check object permissions to enforce RBAC
        self.check_object_permissions(request, plan)
        
        # Verify assignment
        is_assigned = ProjectAssignment.objects.filter(
            project=plan.period.project,
            prorab=request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Calculate totals
        totals = ActualExpenseService.calculate_totals(plan)
        
        serializer = ProrabPlanSummarySerializer({
            'plan_id': plan.id,
            'planned_total': totals['planned_total'],
            'spent_total': totals['spent_total'],
            'remaining': totals['remaining'],
        })
        
        return Response(serializer.data)
    
    @action(detail=True, methods=['get'])
    def expenses(self, request, pk=None):
        """Get actual expenses linked to this plan (read-only for prorab)."""
        # Fetch object directly to avoid queryset filtering issues
        plan = get_object_or_404(ProrabPlan.objects.all(), pk=pk)
        # Explicitly check object permissions to enforce RBAC
        self.check_object_permissions(request, plan)
        
        # Verify assignment
        is_assigned = ProjectAssignment.objects.filter(
            project=plan.period.project,
            prorab=request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Get expenses for this plan
        expenses = ActualExpenseService.get_expenses_for_plan(plan)
        
        serializer = ProrabPlanExpenseSerializer(expenses, many=True)
        return Response(serializer.data)


class ProrabPlanItemViewSet(viewsets.ModelViewSet):
    """ViewSet for ProrabPlanItem CRUD operations."""
    
    serializer_class = ProrabPlanItemSerializer
    permission_classes = [ProrabPlanPermission]
    
    def get_queryset(self):
        """Get items for a specific plan."""
        plan_id = self.kwargs.get('plan_id')
        return ProrabPlanItem.objects.filter(plan_id=plan_id).order_by('-created_at')
    
    def perform_create(self, serializer):
        """Create plan item and recalculate total."""
        plan_id = self.kwargs.get('plan_id')
        
        try:
            plan = ProrabPlan.objects.select_related('period', 'period__project').get(
                pk=plan_id, prorab=self.request.user
            )
        except ProrabPlan.DoesNotExist:
            raise ForbiddenError(detail='Plan not found or access denied')
        
        # Verify ProjectAssignment exists
        is_assigned = ProjectAssignment.objects.filter(
            project=plan.period.project,
            prorab=self.request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Check if editable - only DRAFT status allows editing
        if plan.status != 'draft':
            raise NotEditableError(detail=f'Plan cannot be edited. Current status: {plan.status}. Only DRAFT plans can be edited.')
        
        # Create item, recalculate total, and check limit in transaction
        with transaction.atomic():
            item = serializer.save(plan=plan, created_by=self.request.user)
            ProrabPlanService.calculate_total(plan)
            ProrabPlanService.check_limit_amount(plan)
        
        return item
    
    def perform_update(self, serializer):
        """Update plan item and recalculate total."""
        plan_id = self.kwargs.get('plan_id')
        item = serializer.instance
        plan = item.plan
        
        # Verify plan belongs to user
        if plan.prorab != self.request.user:
            raise ForbiddenError(detail='Plan not found or access denied')
        
        # Verify ProjectAssignment exists
        is_assigned = ProjectAssignment.objects.filter(
            project=plan.period.project,
            prorab=self.request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Check if editable - only DRAFT status allows editing
        if plan.status != 'draft':
            raise NotEditableError(detail=f'Plan cannot be edited. Current status: {plan.status}. Only DRAFT plans can be edited.')
        
        # Update item, recalculate total, and check limit in transaction
        with transaction.atomic():
            serializer.save()
            plan.refresh_from_db()
            ProrabPlanService.calculate_total(plan)
            ProrabPlanService.check_limit_amount(plan)
    
    def perform_destroy(self, instance):
        """Delete plan item and recalculate total."""
        plan = instance.plan
        
        # Verify plan belongs to user
        if plan.prorab != self.request.user:
            raise ForbiddenError(detail='Plan not found or access denied')
        
        # Verify ProjectAssignment exists
        is_assigned = ProjectAssignment.objects.filter(
            project=plan.period.project,
            prorab=self.request.user
        ).exists()
        
        if not is_assigned:
            raise ForbiddenError(detail='You are not assigned to this project')
        
        # Check if editable - only DRAFT status allows editing
        if plan.status != 'draft':
            raise NotEditableError(detail=f'Plan cannot be edited. Current status: {plan.status}. Only DRAFT plans can be edited.')
        
        # Delete item, recalculate total, and check limit in transaction
        with transaction.atomic():
            instance.delete()
            plan.refresh_from_db()
            ProrabPlanService.calculate_total(plan)
            ProrabPlanService.check_limit_amount(plan)


class ProrabPlanSubmitView(APIView):
    """View for submitting a prorab plan."""
    
    permission_classes = [ProrabPlanPermission]
    
    def post(self, request, pk):
        """Submit a plan for approval."""
        try:
            plan = ProrabPlan.objects.get(pk=pk, prorab=request.user)
        except ProrabPlan.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(detail='Plan not found or access denied')
        
        try:
            plan = ProrabPlanService.submit_plan(plan, request.user)
            serializer = ProrabPlanSerializer(plan)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except (NotEditableError, PeriodClosedError, LimitExceededError) as e:
            # These exceptions already have proper structure
            raise
        except DjangoValidationError as e:
            raise NotEditableError(detail=str(e))
        except Exception as e:
            return Response(
                {'code': 'ERROR', 'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class ActualExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for ActualExpense - admin CRUD, prorab read-only."""
    
    queryset = ActualExpense.objects.all()
    serializer_class = ActualExpenseSerializer
    permission_classes = [ActualExpensePermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['finance_period', 'period', 'prorab_plan', 'spent_at']
    search_fields = ['name']
    ordering_fields = ['spent_at', 'created_at', 'amount']
    ordering = ['-spent_at', '-created_at']
    
    def get_queryset(self):
        """Filter queryset based on user role."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'finance_period',
            'finance_period__project',
            'finance_period__month_period',
            'period',
            'prorab_plan',
            'prorab_plan__prorab',
            'created_by'
        )
        
        # Admin: see all expenses
        if self.request.user.role == 'admin':
            return queryset
        
        # Director: see all expenses (read-only)
        if self.request.user.role == 'director':
            return queryset
        
        # Foreman: can only see expenses for projects assigned to that foreman
        if self.request.user.role == 'foreman':
            queryset = queryset.filter(
                finance_period__fund_kind='project',
                finance_period__project__assignments__prorab=self.request.user
            ).distinct()
            return queryset
        
        # Others: no access (permission class handles this)
        return queryset.none()
    
    def perform_create(self, serializer):
        """Create actual expense with audit logging."""
        # Note: Month period lock does NOT affect expenses - expenses can be created even when month is LOCKED
        
        # Call service
        expense = ActualExpenseService.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = expense
    
    def perform_update(self, serializer):
        """Update actual expense with audit logging."""
        # Note: Month period lock does NOT affect expenses - expenses can be updated even when month is LOCKED
        
        # Call service
        ActualExpenseService.update(
            expense=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete actual expense with audit logging."""
        # Note: Month period lock does NOT affect expenses - expenses can be deleted even when month is LOCKED
        
        # Call service
        ActualExpenseService.delete(expense=instance, user=self.request.user)


class ExpenseViewSet(viewsets.ModelViewSet):
    """ViewSet for Expense - admin CRUD, director read-only."""
    
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer
    permission_classes = [ExpensePermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['plan_period', 'category', 'spent_at']
    search_fields = ['comment']
    ordering_fields = ['spent_at', 'created_at', 'amount']
    ordering = ['-spent_at', '-created_at']
    
    def get_queryset(self):
        """Get queryset with optimized queries."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'plan_period',
            'plan_period__project',
            'plan_item',
            'category',
            'created_by',
            'finance_actual_expense'
        )
        return queryset
    
    def perform_create(self, serializer):
        """Create expense with audit logging and sync to ActualExpense."""
        with transaction.atomic():
            expense = ExpenseService.create(
                user=self.request.user,
                **serializer.validated_data
            )
            serializer.instance = expense
            
            # Sync to Finance ActualExpense
            PlanningExpenseActualExpenseSyncService.sync_create(expense, self.request.user)
    
    def perform_update(self, serializer):
        """Update expense with audit logging and sync to ActualExpense."""
        with transaction.atomic():
            ExpenseService.update(
                expense=serializer.instance,
                user=self.request.user,
                **serializer.validated_data
            )
            
            # Sync to Finance ActualExpense
            PlanningExpenseActualExpenseSyncService.sync_update(serializer.instance, self.request.user)
    
    def perform_destroy(self, instance):
        """Delete expense with audit logging and sync delete to ActualExpense."""
        with transaction.atomic():
            # Sync delete ActualExpense first (before deleting Expense)
            PlanningExpenseActualExpenseSyncService.sync_delete(instance, self.request.user)
            
            # Delete Planning Expense
            ExpenseService.delete(expense=instance, user=self.request.user)

