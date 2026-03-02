"""
Reports API URLs.
"""
from django.urls import path
from .views import BudgetPlanReportView, MonthlyReportView

urlpatterns = [
    path('budget/<int:budget_id>/', BudgetPlanReportView.as_view(), name='budget-report'),
    path('monthly/', MonthlyReportView.as_view(), name='monthly-report'),
]

