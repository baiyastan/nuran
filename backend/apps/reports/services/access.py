"""Permission helpers used only by reports views (no ORM)."""
from rest_framework.exceptions import PermissionDenied

from apps.finance.constants import ADMIN_ONLY_MSG


def ensure_owner_dashboard_access(request) -> None:
    role = getattr(request.user, "role", None)
    if not (request.user.is_superuser or role in ("admin", "director")):
        raise PermissionDenied(ADMIN_ONLY_MSG)
