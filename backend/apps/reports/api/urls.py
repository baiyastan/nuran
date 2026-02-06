"""
Reports API URLs.
"""
from django.urls import path
from .views import PlanVsActualReportView, BudgetPlanReportView, MonthlyReportView

urlpatterns = [
    path('plan-vs-actual/', PlanVsActualReportView.as_view(), name='plan-vs-actual'),
    path('budget/<int:budget_id>/', BudgetPlanReportView.as_view(), name='budget-report'),
    path('monthly/', MonthlyReportView.as_view(), name='monthly-report'),
]

