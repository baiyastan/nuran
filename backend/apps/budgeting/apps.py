"""
Budgeting app configuration.
"""
from django.apps import AppConfig


class BudgetingConfig(AppConfig):
    """Budgeting app config."""
    
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.budgeting'

