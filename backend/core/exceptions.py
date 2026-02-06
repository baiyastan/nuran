"""
Custom exceptions.
"""
from rest_framework.exceptions import APIException
from rest_framework import status


class InvalidApprovalStage(APIException):
    """Raised when approval stage transition is invalid."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Invalid approval stage transition.'
    default_code = 'invalid_approval_stage'


class ForbiddenError(APIException):
    """Raised when access is forbidden."""
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = 'Access forbidden.'
    default_code = 'FORBIDDEN'


class NotEditableError(APIException):
    """Raised when plan cannot be edited."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Plan cannot be edited.'
    default_code = 'NOT_EDITABLE'


class PeriodClosedError(APIException):
    """Raised when period is closed."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Period is closed.'
    default_code = 'PERIOD_CLOSED'


class LimitExceededError(APIException):
    """Raised when limit amount is exceeded."""
    status_code = status.HTTP_409_CONFLICT
    default_detail = 'Limit amount exceeded.'
    default_code = 'LIMIT_EXCEEDED'

