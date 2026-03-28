"""
Measure ORM/database cost of report builders without changing their behavior.

- Uses Django's CaptureQueriesContext (same mechanism as assertNumQueries).
- SQL fingerprints help spot N+1 (same template repeated many times).
- EXPLAIN is best-effort: PostgreSQL and SQLite only, SELECT-only guard.
"""
from __future__ import annotations

import re
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

from django.db import connection
from django.test.utils import CaptureQueriesContext

T = TypeVar('T')


_RE_QUOTED = re.compile(r"'(?:[^']|'')*'")
_RE_NUMERIC = re.compile(r'\b\d+\b')


@dataclass
class ProfileReport:
    """Result of profiling a zero-argument callable (wrap your builder in lambda)."""

    duration_ms: float
    query_count: int
    queries: list[dict[str, Any]]
    result: Any = None
    sql_fingerprint_counts: list[tuple[str, int]] = field(default_factory=list)
    total_db_time_ms: float = 0.0


def sql_fingerprint(sql: str, max_len: int = 160) -> str:
    """Normalize SQL for grouping similar queries (literals and integers collapsed)."""
    s = ' '.join(sql.split())
    s = _RE_QUOTED.sub('?', s)
    s = _RE_NUMERIC.sub('N', s)
    return s[:max_len]


def summarize_sql_patterns(queries: list[dict[str, Any]], top_n: int = 12) -> list[tuple[str, int]]:
    """Return (fingerprint, count) for the most repeated query shapes."""
    c: Counter[str] = Counter()
    for q in queries:
        c[sql_fingerprint(q.get('sql', ''))] += 1
    return c.most_common(top_n)


def profile_callable(fn: Callable[[], T]) -> ProfileReport:
    """
    Run fn() while capturing all DB queries from the default connection.

    Wall time includes Python work (aggregations, ReportLab, etc.), not just SQL.
    """
    started = time.perf_counter()
    with CaptureQueriesContext(connection) as ctx:
        result = fn()
    duration_ms = (time.perf_counter() - started) * 1000
    queries = list(ctx.captured_queries)
    db_time = 0.0
    for q in queries:
        try:
            db_time += float(q.get('time', 0) or 0)
        except (TypeError, ValueError):
            pass
    return ProfileReport(
        duration_ms=duration_ms,
        query_count=len(queries),
        queries=queries,
        result=result,
        sql_fingerprint_counts=summarize_sql_patterns(queries),
        total_db_time_ms=db_time * 1000,  # Django stores seconds per query
    )


def explain_select_sql(sql: str) -> str | None:
    """
    Run EXPLAIN for a single statement. Returns None if unsupported or unsafe.

    For PostgreSQL uses EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT).
    For SQLite uses EXPLAIN QUERY PLAN.
    """
    sql_stripped = sql.strip()
    if not sql_stripped.upper().startswith('SELECT'):
        return None
    vendor = connection.vendor
    try:
        with connection.cursor() as cursor:
            if vendor == 'postgresql':
                cursor.execute('EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ' + sql_stripped)
            elif vendor == 'sqlite':
                cursor.execute('EXPLAIN QUERY PLAN ' + sql_stripped)
            else:
                return None
            rows = cursor.fetchall()
    except Exception as exc:  # noqa: BLE001 — surfacing driver errors to caller
        return f'EXPLAIN failed ({vendor}): {exc}'
    if not rows:
        return '(no rows)'
    if len(rows[0]) == 1:
        return '\n'.join(str(r[0]) for r in rows)
    return '\n'.join(str(r) for r in rows)


def longest_queries(queries: list[dict[str, Any]], n: int = 5) -> list[dict[str, Any]]:
    """Queries sorted by Django-reported SQL duration (descending)."""
    def key(q: dict[str, Any]) -> float:
        try:
            return float(q.get('time', 0) or 0)
        except (TypeError, ValueError):
            return 0.0

    return sorted(queries, key=key, reverse=True)[:n]
