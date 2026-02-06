"""
Actuals API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ActualItemViewSet

router = DefaultRouter()
router.register(r'actual-items', ActualItemViewSet, basename='actual-item')

urlpatterns = [
    path('', include(router.urls)),
]

