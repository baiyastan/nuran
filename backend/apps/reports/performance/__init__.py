"""
Report performance profiling helpers (query count, timing, SQL fingerprints).

Use from tests, management commands, or one-off scripts. Does not alter report semantics.
"""

from .profiling import ProfileReport, explain_select_sql, profile_callable, summarize_sql_patterns

__all__ = [
    'ProfileReport',
    'explain_select_sql',
    'profile_callable',
    'summarize_sql_patterns',
]
