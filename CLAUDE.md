# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nuran is a full-stack web application for managing Projects, Plans, and Planning Items with multi-stage approval workflows, budgeting, and audit logging. It uses a Django REST Framework backend and React/TypeScript frontend.

## Commands

### Backend

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver          # Dev server at localhost:8000
pytest                              # Run all tests
pytest tests/path/to/test_file.py  # Run a single test file
pytest -k "test_name"              # Run a specific test by name
pytest --cov=apps                  # Run with coverage
```

### Frontend

```bash
cd frontend
pnpm install
pnpm run dev        # Dev server at localhost:5173 (proxies /api to backend)
pnpm run build
pnpm run lint
pnpm run typecheck
pnpm run test       # Vitest
```

### Docker (Production)

```bash
cp .env.example .env   # Fill in values
docker compose -f infra/docker-compose.yml up -d --build
```

Services: `db` (PostgreSQL 16), `redis`, `backend` (Gunicorn), `nginx`, `webhook`, `certbot`.

### Database Backup/Restore

```bash
./scripts/backup.sh                              # Dump to /var/backups/nuran (keeps 7)
./scripts/restore.sh /var/backups/nuran/<file>.sql.gz
```

## Architecture

### Backend (`backend/`)

Django apps live under `backend/apps/`:

- **users** — Custom `User` model (email as `USERNAME_FIELD`) with a `role` field (`admin`, `director`, `foreman`). JWT auth via `djangorestframework_simplejwt`.
- **projects** — Projects that contain plan periods.
- **planning** — Core domain: `PlanPeriod`, `PlanItem`, `ProrabPlan`, `ActualExpense`. This is the largest and most complex app.
- **budgeting** — `BudgetPlan`, `ExpenseCategory`, `MonthPeriod`.
- **finance** — Financial constraints and management.
- **expenses** / **actuals** — Expense tracking and actuals.
- **reports** — Analytics and reporting views, including foreman-specific report.
- **audit** — Audit trail for all modifications (written automatically via signals/middleware).
- **plans** — Legacy/deprecated plan models.

Layer order: `Views → Serializers → Services → Models`. Custom permission classes for RBAC live in `backend/core/permissions.py`.

### RBAC & Approval Workflow

| Role | Capabilities |
|------|-------------|
| Admin | Full CRUD, approvals, audit logs |
| Director | Manage projects/plans, approve from foreman stage |
| Foreman | Create plan items only (append-only) |

Approval stages on `PlanItem`: `foreman → director → admin`, tracked via `approval_stage` and `status` fields. `fund_kind` on `PlanPeriod` is `project | office | charity`.

### Frontend (`frontend/src/`)

Follows **Feature-Sliced Design**:

- **app/** — Router, Redux store setup, global providers.
- **pages/** — Route-level page components; thin wrappers around features.
- **features/** — ~35 feature modules (e.g., `planItems`, `approval`, `budgeting`). Business logic lives here.
- **entities/** — Domain model types and API client functions (Axios-based).
- **widgets/** — Reusable composite components (navbar, sidebars).
- **components/** — Shared presentational components.
- **shared/** — Utilities, i18n (`i18next`), UI primitives.

TypeScript is in strict mode (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`).

State management: Redux Toolkit. API calls: Axios. Charting: Recharts. i18n: i18next.

### Infrastructure (`infra/`)

Nginx selects its config based on `NGINX_CONF_TARGET` env var (`http.conf` or `ssl.conf`). SSL uses Let's Encrypt via the `certbot` service with webroot challenge.

Auto-deploy: GitHub push to `main` → HMAC-SHA256-verified webhook at `/hooks/deploy` → `scripts/deploy.sh` (git pull + docker compose rebuild). A lock file prevents overlapping deploys.

## Key Environment Variables

See `.env.example` for the full list. Critical ones:

- `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`
- `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- `VITE_API_BASE` — typically `/api/v1`
- `WEBHOOK_SECRET` — HMAC secret for GitHub webhook validation
- `NGINX_CONF_TARGET` — `http.conf` (dev/HTTP) or `ssl.conf` (production HTTPS)
