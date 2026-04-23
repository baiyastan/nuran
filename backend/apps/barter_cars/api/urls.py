"""Barter-car API URLs."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import BarterCarViewSet

router = DefaultRouter()
router.register(r'barter-cars', BarterCarViewSet, basename='barter-car')

urlpatterns = [
    path('', include(router.urls)),
]
