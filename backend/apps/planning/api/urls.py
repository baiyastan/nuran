"""
Planning API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PlanPeriodViewSet, PlanItemViewSet,
    ProrabProjectsViewSet, ProrabPlanPeriodsViewSet,
    ProrabPlanViewSet, ProrabPlanItemViewSet, ProrabPlanSubmitView,
    ActualExpenseViewSet
)

router = DefaultRouter()
router.register(r'plan-periods', PlanPeriodViewSet, basename='plan-period')
router.register(r'plan-items', PlanItemViewSet, basename='plan-item')
router.register(r'actual-expenses', ActualExpenseViewSet, basename='actual-expense')

# Prorab endpoints
prorab_router = DefaultRouter()
prorab_router.register(r'projects', ProrabProjectsViewSet, basename='prorab-project')

urlpatterns = [
    path('', include(router.urls)),
    path('prorab/', include(prorab_router.urls)),
    path('prorab/projects/<int:project_id>/plan-periods/', ProrabPlanPeriodsViewSet.as_view({'get': 'list'}), name='prorab-project-plan-periods'),
    path('prorab/plan-periods/<int:pk>/plan/', ProrabPlanViewSet.as_view({'get': 'retrieve'}), name='prorab-plan-period-plan'),
    path('prorab/plans/<int:plan_id>/items/', ProrabPlanItemViewSet.as_view({
        'get': 'list',
        'post': 'create'
    }), name='prorab-plan-items'),
    path('prorab/plans/<int:plan_id>/items/<int:pk>/', ProrabPlanItemViewSet.as_view({
        'get': 'retrieve',
        'patch': 'partial_update',
        'put': 'update',
        'delete': 'destroy'
    }), name='prorab-plan-item-detail'),
    path('prorab/plans/<int:pk>/submit/', ProrabPlanSubmitView.as_view(), name='prorab-plan-submit'),
    path('prorab/plans/<int:pk>/summary/', ProrabPlanViewSet.as_view({'get': 'summary'}), name='prorab-plan-summary'),
    path('prorab/plans/<int:pk>/expenses/', ProrabPlanViewSet.as_view({'get': 'expenses'}), name='prorab-plan-expenses'),
]

