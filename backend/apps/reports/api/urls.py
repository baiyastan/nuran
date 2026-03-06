"""
Reports API URLs.
"""
from django.urls import path
from .views import (
    BudgetPlanReportView,
    MonthlyReportView,
    DashboardKpiView,
    DashboardExpenseCategoriesView,
    DashboardIncomeSourcesView,
)

urlpatterns = [
    path('budget/<int:budget_id>/', BudgetPlanReportView.as_view(), name='budget-report'),
    path('monthly/', MonthlyReportView.as_view(), name='monthly-report'),
    path('dashboard-kpis/', DashboardKpiView.as_view(), name='dashboard-kpis'),
    path(
        'dashboard-expense-categories/',
        DashboardExpenseCategoriesView.as_view(),
        name='dashboard-expense-categories',
    ),
    path(
        'dashboard-income-sources/',
        DashboardIncomeSourcesView.as_view(),
        name='dashboard-income-sources',
    ),
]

