# Report performance baseline and profiling discipline

This document defines **how to measure** report cost before and after optimizations. Business rules and report semantics are unchanged; we only observe cost.

## Highest-risk endpoints (likely complexity)

Ordered by typical cost (DB + Python). Exact numbers depend on data volume and PostgreSQL vs SQLite.

| Priority | HTTP route (prefix `api/v1/reports/`) | Why it is risky |
|----------|--------------------------------------|-----------------|
| 1 | `dashboard-kpis/?month=` | Many aggregates, date-scoped sums, transfers, **`get_balance_for_account`** (cumulative), plus short-TTL cache invalidation can force cold paths often. |
| 2 | `export-*-pdf/` (section, detail, transfers-direction) | ReportLab CPU + same data assembly as JSON; large row sets on detail PDFs. |
| 3 | `dashboard-expense-categories/?month=` | Cross-scope plan + fact aggregation; **not** in short-TTL cache today. |
| 4 | `dashboard-income-sources/?month=` | Same pattern as expense categories; **not** cached. |
| 5 | `monthly/?month=&scope=` | Plan vs fact by category; cached when `REPORTS_CACHE_ENABLED` is on. |
| 6 | `transfer-details/?month=` | Lighter JSON; still worth tracking next to `transfers-direction-pdf`. |
| 7 | `budget/<id>/`, `foreman` summary | Lower traffic or narrower aggregates; profile if usage grows. |

**Service entry points** (profile these directly for stable baselines):

- `apps.reports.services.dashboard.build_dashboard_kpi_response_data`
- `apps.reports.services.dashboard.build_dashboard_expense_categories_data`
- `apps.reports.services.dashboard.build_dashboard_income_sources_data`
- `apps.reports.services.monthly.build_monthly_report_payload`
- `apps.reports.services.pdf_exports.run_export_*` (includes PDF generation time)
- `apps.reports.services.transfers.build_transfer_details_payload`

## Profiling methods

### 1. Management command (real database shape)

Requires a `MonthPeriod` for the chosen month in the **database you are measuring** (dev copy, staging, or local DB with fixtures).

```bash
# Ensure a period exists, e.g.:
python manage.py shell -c "from apps.budgeting.models import MonthPeriod; MonthPeriod.objects.get_or_create(month='2026-01', defaults={'status': 'OPEN'})"

python manage.py profile_reports --month 2026-01
python manage.py profile_reports --month 2026-01 --explain 2
python manage.py profile_reports --month 2026-01 --include-pdf-data
```

Output columns:

- **queries** — SQL statements executed on the default connection (same idea as `assertNumQueries`).
- **db_ms** — sum of Django-reported per-query times (driver overhead included; not a full server profile).
- **wall_ms** — end-to-end time including Python (aggregations, PDF, etc.).
- **repeated_top** — most common normalized SQL fingerprint (suspect **N+1** if one shape dominates with high count).

The command forces **cold** short-term report cache (`REPORTS_CACHE_ENABLED=False` for its duration).

### 2. Programmatic helper (tests, notebooks, one-offs)

```python
from apps.reports.performance import profile_callable, summarize_sql_patterns, explain_select_sql

report = profile_callable(lambda: build_foo(...))
print(report.query_count, report.duration_ms, report.sql_fingerprint_counts[:5])
```

- **`explain_select_sql(sql)`** — runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` on PostgreSQL or `EXPLAIN QUERY PLAN` on SQLite for **SELECT** only. Use on slow queries surfaced by `--explain` or `longest_queries(report.queries)`.

### 3. Django test helpers

- **`django_assert_num_queries`** / **`assertNumQueries`** — pin exact query count for a specific scenario in a focused test (good for refactors that must not add round-trips).
- **`CaptureQueriesContext`** — same mechanism as `profile_callable` (see `apps.reports.performance.profiling`).

### 4. PostgreSQL-specific analysis

For production-shaped data:

1. Enable `log_min_duration_statement` or use `pg_stat_statements` to find top statements by total time.
2. Take SQL text from logs or from Django debug output, then run `EXPLAIN (ANALYZE, BUFFERS)` in `psql`.
3. Watch for sequential scans on large tables, missing indexes on `month_period_id`, `spent_at`, `transferred_at`, FK filters used in dashboard KPI paths.

**ORM smells to watch** (no logic change in profiling phase—only detection):

- Same fingerprint **many times** in one request → N+1 or repeated aggregate patterns.
- Very high query count with **low** row cardinality → consider `select_related` / `prefetch_related` or consolidating aggregates.
- Heavy Python loops over querysets inside builders → CPU flamegraph (`py-spy`) outside Django.

## Regression guard (CI)

- **`tests/test_reports_performance_baseline.py`** — `@pytest.mark.report_perf` compares cold-path **query counts** against `tests/baselines/report_service_query_budgets.json` on a **minimal** DB (mostly empty, one `MonthPeriod`).
- Budgets are **loose**; they catch accidental extra round-trips, not milliseconds.
- After an intentional ORM change, re-measure and **update the JSON** with a short justification in the PR.

Run:

```bash
pytest tests/test_reports_performance_baseline.py -m report_perf
```

Note: PostgreSQL may emit slightly different query counts than SQLite (e.g. savepoints). If CI uses PG, re-baseline on that engine.

## Checklist: before each performance change

- [ ] Capture **current** `profile_reports` output (or saved spreadsheet) for **month + scope** representative of production load.
- [ ] Record **query count**, **wall_ms**, and top **repeated** fingerprint for each target endpoint.
- [ ] For the slowest SELECT, store **EXPLAIN (ANALYZE)** summary (or attach in ticket).
- [ ] Confirm whether the path was **cache hit or miss** for KPI/monthly (`REPORTS_CACHE_ENABLED`, TTL).

## Checklist: after each performance change

- [ ] Re-run the same `profile_reports` command with the same `--month` and data snapshot.
- [ ] Re-run `pytest tests/test_reports_performance_baseline.py -m report_perf`.
- [ ] Compare query count and wall time **before/after** in the PR description.
- [ ] If semantics could drift, add or extend **functional** tests (existing report tests) — performance work should not change numbers without test updates.

## Optimization candidates (for later phases; not implemented here)

These are typical follow-ups once baselines exist:

- **KPI:** reduce redundant queries in `build_dashboard_kpi_response_data`; investigate `get_balance_for_account` call pattern and date-range scans.
- **Dashboard sections:** merge or cache plan/fact aggregations (short-TTL or snapshot, separate initiative).
- **Monthly:** already short-TTL cached; optimize cold path and invalidation breadth.
- **PDF:** async export (separate initiative); DB portion should reuse the same profiling as JSON builders.

---

*Introduced modules: `apps.reports.performance`, `manage.py profile_reports`, baseline JSON + pytest.*
