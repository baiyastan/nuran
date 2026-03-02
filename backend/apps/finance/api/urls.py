"""
Finance API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    FinancePeriodViewSet, IncomeEntryViewSet,
    IncomeSourceViewSet, IncomePlanViewSet
)

router = DefaultRouter()
router.register(r'finance-periods', FinancePeriodViewSet, basename='finance-period')
router.register(r'income-entries', IncomeEntryViewSet, basename='income-entry')

# Income planning endpoints
income_router = DefaultRouter()
income_router.register(r'sources', IncomeSourceViewSet, basename='income-source')
income_router.register(r'plans', IncomePlanViewSet, basename='income-plan')

urlpatterns = [
    path('', include(router.urls)),
    path('income/', include(income_router.urls)),
]

