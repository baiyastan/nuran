"""
Custom exception handler for DRF to return {code, detail} format.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response


def custom_exception_handler(exc, context):
    """
    Custom exception handler that returns {code, detail} format.
    """
    # Call REST framework's default exception handler first
    response = exception_handler(exc, context)
    
    if response is not None:
        # Get the error code from the exception
        code = getattr(exc, 'default_code', 'error')
        
        # If detail is a string, wrap it
        if isinstance(response.data, dict):
            detail = response.data.get('detail', str(exc))
        else:
            detail = str(response.data) if response.data else str(exc)
        
        # Return standardized format
        response.data = {
            'code': code.upper() if isinstance(code, str) else code,
            'detail': detail
        }
    
    return response

