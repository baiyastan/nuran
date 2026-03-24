"""
Foreman report API URLs.
"""
from django.urls import path

from .views import ForemanProjectSummaryView

urlpatterns = [
    path('project-summary/', ForemanProjectSummaryView.as_view(), name='foreman-project-summary'),
]
