"""
Auth API URLs (login, register, me, logout, refresh).
"""
from django.urls import path
from .views import (
    CustomTokenObtainPairView,
    CustomTokenRefreshView,
    logout,
    me,
    register,
)

urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('refresh/', CustomTokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', logout, name='logout'),
    path('me/', me, name='me'),
    path('register/', register, name='register'),
]

