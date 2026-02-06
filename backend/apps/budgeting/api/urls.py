"""
Budgeting API URLs.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BudgetPlanViewSet, ExpenseCategoryViewSet, BudgetLineViewSet, MonthPeriodViewSet, BudgetExpenseViewSet

router = DefaultRouter()
router.register(r'budgets', BudgetPlanViewSet, basename='budget')
router.register(r'budget-lines', BudgetLineViewSet, basename='budget-line')
router.register(r'expenses', BudgetExpenseViewSet, basename='budget-expense')
router.register(r'expense-categories', ExpenseCategoryViewSet, basename='expense-category')
router.register(r'month-periods', MonthPeriodViewSet, basename='month-period')

urlpatterns = [
    path('', include(router.urls)),
]

