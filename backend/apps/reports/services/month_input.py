"""Month string validation and MonthPeriod resolution for reports APIs."""
import re

from rest_framework import status
from rest_framework.response import Response

from apps.budgeting.models import MonthPeriod
from apps.finance.constants import MONTH_REQUIRED_MSG


def get_validated_month_period(month_param: str | None) -> tuple[tuple[str, MonthPeriod] | None, Response | None]:
    """
    Parse ?month=YYYY-MM and load MonthPeriod.

    Returns (None, Response) on error — same bodies/status codes as the original view helper.
    """
    if not month_param:
        return None, Response(
            {'month': 'month parameter is required (format: YYYY-MM)'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    month = month_param.strip()
    if not re.match(r'^\d{4}-\d{2}$', month):
        return None, Response(
            {'month': 'Invalid format. Month must match YYYY-MM (e.g. 2026-02).'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        month_period = MonthPeriod.objects.get(month=month)
    except MonthPeriod.DoesNotExist:
        return None, Response({'month': MONTH_REQUIRED_MSG}, status=status.HTTP_400_BAD_REQUEST)

    return (month, month_period), None
