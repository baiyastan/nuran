# Nuran - Production Web App

A production-grade web application for managing Projects, Plans, and PlanItems with multi-stage approval workflow.

## Architecture

- **Backend**: Django REST Framework with layered architecture (API → Services → Repositories → Models)
- **Frontend**: React + Vite + TypeScript with Feature-Sliced Design
- **RBAC**: Role-based access control (Admin, Director, Foreman)
- **Audit Logging**: Comprehensive audit trail for all actions

## Features

- **Projects**: Manage projects (Admin/Director only)
- **Plans**: Manage plans within projects (Admin/Director only)
- **Plan Items**: Create and approve plan items with multi-stage workflow
  - Foreman: Can only create (append-only)
  - Director: Can approve from foreman stage
  - Admin: Can approve from director stage and delete
- **Audit Logs**: View all actions (Admin only)
- **Filtering**: Server-side and client-side filtering for plan items

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Testing

### Backend Tests

```bash
cd backend
pytest
```

## API Endpoints

All endpoints are under `/api/v1/`:

- `GET /api/v1/projects/` - List projects (Admin/Director)
- `POST /api/v1/projects/` - Create project (Admin/Director)
- `GET /api/v1/plans/` - List plans (Admin/Director)
- `POST /api/v1/plans/` - Create plan (Admin/Director)
- `GET /api/v1/plan-items/` - List plan items (All authenticated)
- `POST /api/v1/plan-items/` - Create plan item (Foreman/Director/Admin)
- `PATCH /api/v1/plan-items/{id}/` - Update plan item (Director/Admin)
- `POST /api/v1/plan-items/{id}/approve/` - Approve plan item (Director/Admin)
- `DELETE /api/v1/plan-items/{id}/` - Delete plan item (Admin)
- `GET /api/v1/audit-logs/` - List audit logs (Admin)
- `POST /api/v1/auth/login/` - Login
- `POST /api/v1/auth/logout/` - Logout
- `GET /api/v1/auth/user/` - Get current user

## RBAC Rules

- **Admin**: Full access to all resources
- **Director**: Can manage projects, plans, and approve plan items
- **Foreman**: Can only create plan items (no update/delete)

## Approval Workflow

1. Foreman creates PlanItem → `status: pending`, `approval_stage: foreman`
2. Director approves → `status: pending`, `approval_stage: director`
3. Admin approves → `status: approved`, `approval_stage: admin`

## Project Structure

```
backend/
├── apps/
│   ├── users/          # User model and auth
│   ├── projects/       # Project app
│   ├── plans/         # Plan app
│   ├── plan_items/    # PlanItem app
│   └── audit/         # Audit logging
├── core/              # Core permissions and exceptions
└── config/            # Django settings

frontend/
├── src/
│   ├── app/           # App setup and routing
│   ├── pages/         # Page components
│   ├── features/      # Feature components
│   ├── entities/      # Entity models and API clients
│   ├── widgets/       # Widget components
│   └── shared/        # Shared utilities and UI
```

