"""
User admin.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom user admin."""
    list_display = ('email', 'username', 'role', 'is_staff', 'is_active')
    list_filter = ('role', 'is_staff', 'is_active')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Role', {'fields': ('role',)}),
    )
    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ('Role', {'fields': ('role',)}),
    )
    
    def has_change_permission(self, request, obj=None):
        """Only admins can change user roles."""
        if obj and hasattr(obj, 'role'):
            # Only allow role changes if user is admin or superuser
            if request.user.is_superuser:
                return True
            return request.user.role == 'admin'
        return super().has_change_permission(request, obj)

