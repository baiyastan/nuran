"""
Short-TTL caching for expensive read-only report payloads.

Keys are versioned so cache layout can change without collisions.
Responses are pickled as returned by services (identical to uncached path).
"""
from django.conf import settings
from django.core.cache import cache

CACHE_VERSION = 1
KEY_PREFIX = f"reports:v{CACHE_VERSION}"


def reports_cache_enabled() -> bool:
    return bool(getattr(settings, "REPORTS_CACHE_ENABLED", True))


def reports_cache_ttl() -> int:
    return int(getattr(settings, "REPORTS_CACHE_TTL", 90))


def dashboard_kpi_cache_key(month: str, month_period_id: int) -> str:
    return f"{KEY_PREFIX}:dashboard_kpi:{month}:{month_period_id}"


def monthly_report_cache_key(month: str, scope: str, month_period_id: int) -> str:
    return f"{KEY_PREFIX}:monthly:{month}:{scope}:{month_period_id}"


def get_cached_report(key: str):
    return cache.get(key)


def set_cached_report(key: str, payload, timeout: int | None = None) -> None:
    cache.set(key, payload, timeout if timeout is not None else reports_cache_ttl())
