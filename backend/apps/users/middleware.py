"""
Token authentication middleware.
"""
from django.contrib.auth.models import AnonymousUser
from django.utils.functional import SimpleLazyObject
from .models import User


def get_user_from_token(token):
    """Get user from token (simplified - in production use proper token storage)."""
    # In a real implementation, you'd validate the token against a database
    # For now, we'll use session auth as fallback
    return None


class TokenAuthMiddleware:
    """Middleware to handle token authentication."""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Check for Authorization header
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            # For now, we'll rely on session auth
            # In production, validate token and set user
            pass
        
        response = self.get_response(request)
        return response

