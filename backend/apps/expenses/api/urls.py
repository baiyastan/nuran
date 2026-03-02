"""
Expenses API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ActualExpenseViewSet

router = DefaultRouter()
router.register(r'actual-expenses', ActualExpenseViewSet, basename='actual-expense')

urlpatterns = [
    path('', include(router.urls)),
]
