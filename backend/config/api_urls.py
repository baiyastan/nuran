"""
API URL configuration.
"""
from django.urls import path, include

urlpatterns = [
    path('auth/', include('apps.users.api.auth_urls')),
    path('users/', include('apps.users.api.users_urls')),
    path('', include('apps.projects.api.urls')),
    path('', include('apps.planning.api.urls')),
    path('budgets/', include('apps.budgeting.api.urls')),
    path('reports/', include('apps.reports.api.urls')),
    path('', include('apps.audit.api.urls')),
]
