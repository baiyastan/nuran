"""Pytest hooks shared across backend tests."""
import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clear_default_cache():
    """Avoid cross-test pollution from report short-TTL caches (LocMem is process-wide)."""
    cache.clear()
    yield
    cache.clear()
