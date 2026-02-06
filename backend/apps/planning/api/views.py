"""
Planning API views.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.db import transaction
from core.exceptions import (
    InvalidApprovalStage, ForbiddenError, NotEditableError,
    PeriodClosedError, LimitExceededError
)
from django.core.exceptions import ValidationError
from ..models import PlanPeriod, PlanItem, ProrabPlan, ProrabPlanItem, ActualExpense
from ..services import PlanPeriodService, PlanItemService, ProrabPlanService, ActualExpenseService
from .serializers import (
    PlanPeriodSerializer, PlanItemSerializer,
    ProjectAssignmentSerializer, ProrabPlanPeriodSerializer,
    ProrabPlanSerializer, ProrabPlanItemSerializer,
    ActualExpenseSerializer, ProrabPlanSummarySerializer, ProrabPlanExpenseSerializer,
    ProrabProjectSerializer,
)
from ..permissions import PlanPeriodPermission, PlanItemPermission, ProrabPlanPermission, ActualExpensePermission
from ..filters import PlanItemFilter
from apps.projects.models import ProjectAssignment, Project
from apps.projects.api.serializers import ProjectSerializer


class PlanPeriodViewSet(viewsets.ModelViewSet):
    """ViewSet for PlanPeriod."""
    
    queryset = PlanPeriod.objects.all()
    serializer_class = PlanPeriodSerializer
    permission_classes = [PlanPeriodPermission]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['project', 'status', 'period']
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
        service = PlanPeriodService()
        plan_period = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = plan_period
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Submit a plan period for approval."""
        plan_period = self.get_object()
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
        plan_period = self.get_object()
        
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
        
        # Foreman can only see plan items from assigned projects
        if self.request.user.role == 'foreman':
            queryset = queryset.filter(
                plan_period__project__assignments__prorab=self.request.user
            ).distinct()
        
        return queryset
    
    def perform_create(self, serializer):
        """Create plan item with audit logging."""
        service = PlanItemService()
        plan_item = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = plan_item
    
    def perform_update(self, serializer):
        """Update plan item with audit logging."""
        service = PlanItemService()
        service.update(
            plan_item=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete plan item with audit logging."""
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
        try:
            plan = ProrabPlan.objects.get(pk=pk, prorab=request.user)
        except ProrabPlan.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(detail='Plan not found or access denied')
        
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
        try:
            plan = ProrabPlan.objects.get(pk=pk, prorab=request.user)
        except ProrabPlan.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound(detail='Plan not found or access denied')
        
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
        except ValidationError as e:
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
    filterset_fields = ['project', 'period', 'prorab_plan', 'spent_at']
    search_fields = ['name']
    ordering_fields = ['spent_at', 'created_at', 'amount']
    ordering = ['-spent_at', '-created_at']
    
    def get_queryset(self):
        """Filter queryset based on user role."""
        queryset = super().get_queryset()
        queryset = queryset.select_related(
            'project',
            'period',
            'prorab_plan',
            'prorab_plan__prorab',
            'created_by'
        )
        
        # Admin and director: see all expenses
        if self.request.user.role in ('admin', 'director'):
            return queryset
        
        # Prorab: only see expenses linked to their own plans, exclude Office project
        if self.request.user.role == 'foreman':
            queryset = queryset.filter(
                prorab_plan__prorab=self.request.user
            ).exclude(
                project__name__iexact='office'
            )
            return queryset
        
        # Others: no access (permission class handles this)
        return queryset.none()
    
    def perform_create(self, serializer):
        """Create actual expense with audit logging."""
        service = ActualExpenseService()
        expense = service.create(
            user=self.request.user,
            **serializer.validated_data
        )
        serializer.instance = expense
    
    def perform_update(self, serializer):
        """Update actual expense with audit logging."""
        service = ActualExpenseService()
        service.update(
            expense=serializer.instance,
            user=self.request.user,
            **serializer.validated_data
        )
    
    def perform_destroy(self, instance):
        """Delete actual expense with audit logging."""
        service = ActualExpenseService()
        service.delete(expense=instance, user=self.request.user)

