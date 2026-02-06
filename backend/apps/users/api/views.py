"""
User API views.
"""
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import viewsets
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.contrib.auth import authenticate
from core.permissions import IsAdmin
from apps.audit.services import AuditLogService
from ..models import User
from .serializers import (
    UserSerializer, 
    EmailTokenObtainPairSerializer,
    RegisterSerializer,
    UserListSerializer,
    UserRoleUpdateSerializer
)


class CustomTokenObtainPairView(TokenObtainPairView):
    """Custom JWT login view that returns access token and sets refresh token as HttpOnly cookie."""
    
    serializer_class = EmailTokenObtainPairSerializer
    
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == 200:
            # Get user from email
            email = request.data.get('email')
            try:
                user = User.objects.get(email=email)
                serializer = UserSerializer(user)
                
                # Extract refresh token from response
                refresh_token = response.data.pop('refresh', None)
                
                # Set refresh token as HttpOnly cookie
                if refresh_token:
                    response.set_cookie(
                        'refresh',
                        refresh_token,
                        httponly=True,
                        secure=not settings.DEBUG,  # Secure in production
                        samesite='Lax',
                        path='/api/v1/auth/refresh/',
                        max_age=7*24*60*60,  # 7 days (matching REFRESH_TOKEN_LIFETIME)
                    )
                
                # Return only access token and user data
                response.data = {
                    'access': response.data.get('access'),
                    'user': serializer.data,
                }
            except User.DoesNotExist:
                pass
        return response


class CustomTokenRefreshView(TokenRefreshView):
    """Custom refresh view that reads refresh token from HttpOnly cookie."""
    
    def post(self, request, *args, **kwargs):
        # Get refresh token from cookie
        refresh_token = request.COOKIES.get('refresh')
        
        if not refresh_token:
            return Response(
                {'detail': 'Refresh token not found in cookie.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        
        # Set refresh token in request data for serializer
        request.data['refresh'] = refresh_token
        
        try:
            response = super().post(request, *args, **kwargs)
            if response.status_code == 200:
                # Return only access token
                response.data = {
                    'access': response.data.get('access'),
                }
            return response
        except (TokenError, InvalidToken) as e:
            return Response(
                {'detail': str(e)},
                status=status.HTTP_401_UNAUTHORIZED
            )


@api_view(['POST'])
@permission_classes([AllowAny])  # Allow unauthenticated logout
def logout(request):
    """Logout view that clears refresh cookie."""
    response = Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
    # Clear refresh cookie by setting it to expired
    response.set_cookie(
        'refresh',
        '',
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path='/api/v1/auth/refresh/',
        max_age=0,  # Expire immediately
    )
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    """Get current user."""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """Register a new user."""
    serializer = RegisterSerializer(data=request.data)
    
    if serializer.is_valid():
        user = serializer.save()
        
        # Generate JWT tokens
        refresh = RefreshToken.for_user(user)
        access_token = str(refresh.access_token)
        refresh_token = str(refresh)
        
        # Create response
        response = Response(
            {
                'access': access_token,
                'user': UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED
        )
        
        # Set refresh token as HttpOnly cookie (same pattern as login)
        response.set_cookie(
            'refresh',
            refresh_token,
            httponly=True,
            secure=not settings.DEBUG,
            samesite='Lax',
            path='/api/v1/auth/refresh/',
            max_age=7*24*60*60,  # 7 days
        )
        
        return response
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """ViewSet for user management (admin only)."""
    
    queryset = User.objects.all()
    serializer_class = UserListSerializer
    permission_classes = [IsAdmin]
    
    def get_queryset(self):
        """Filter queryset by role if requested."""
        queryset = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            queryset = queryset.filter(role=role)
        return queryset
    
    def list(self, request, *args, **kwargs):
        """List all users."""
        return super().list(request, *args, **kwargs)
    
    @action(detail=True, methods=['patch'], url_path='role')
    def update_role(self, request, pk=None):
        """Update user role (admin only)."""
        user = self.get_object()
        serializer = UserRoleUpdateSerializer(data=request.data)
        
        if serializer.is_valid():
            # Capture before state for audit log
            before_state = {'role': user.role}
            
            # Update role
            new_role = serializer.validated_data['role']
            user.role = new_role
            user.save()
            
            # Audit log role change
            AuditLogService.log_update(
                actor=request.user,
                instance=user,
                before_state=before_state
            )
            
            return Response(
                UserListSerializer(user).data,
                status=status.HTTP_200_OK
            )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

