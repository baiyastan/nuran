"""Shared query-parameter parsing for reports (nullable id drill-downs)."""
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response


def parse_nullable_target_id(
    request: Request,
    param_name: str,
) -> tuple[tuple[int | None, bool] | None, Response | None]:
    """
    Parse source_id/category_id as integer or the literal \"null\" for uncategorized.

    Returns ((id_or_none, is_uncategorized), None) or (None, Response).
    """
    raw_value = request.query_params.get(param_name)
    if raw_value is None:
        return None, Response(
            {param_name: f'{param_name} query parameter is required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    raw_value = raw_value.strip()
    if raw_value == 'null':
        return (None, True), None

    try:
        return (int(raw_value), False), None
    except (TypeError, ValueError):
        return None, Response(
            {param_name: f'{param_name} must be an integer or "null"'},
            status=status.HTTP_400_BAD_REQUEST,
        )
