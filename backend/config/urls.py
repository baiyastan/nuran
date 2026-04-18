"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include

from .health import healthz

urlpatterns = [
    path('admin/', admin.site.urls),
    path('healthz', healthz, name='healthz'),
    path('api/healthz', healthz, name='healthz-api'),
    path('api/v1/healthz', healthz, name='healthz-api-v1'),
    path('api/', include('config.api_urls')),
    path('api/v1/', include('config.api_urls')),
]

