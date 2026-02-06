# FORENSIC AUDIT REPORT - Monthly Budget System Architecture

**Date:** 2026-02-04  
**Purpose:** Evidence-based analysis of current architecture to implement correct monthly budget system

---

## PART A — CURRENT ARCHITECTURE FACTS (with proofs)

### 1) Roles

**File:** `backend/apps/users/models.py`

**User.role field definition:**
```python
class User(AbstractUser):
    ROLE_CHOICES = [
        ('admin', 'Admin'),
        ('director', 'Director'),
        ('foreman', 'Foreman'),
    ]
    
    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='foreman',
        help_text='User role for RBAC'
    )
```

**Roles that exist:**
- `admin` - Admin
- `director` - Director  
- `foreman` - Foreman (Prorab)

**Proof:** Lines 43-59 in `backend/apps/users/models.py`

---

### 2) Categories

**File:** `backend/apps/budgeting/models.py`

**ExpenseCategory model definition:**
```python
class ExpenseCategory(models.Model):
    SCOPE_CHOICES = [
        ('project', 'Project'),
        ('office', 'Office'),
    ]
    
    name = models.CharField(max_length=255)
    scope = models.CharField(
        max_length=20,
        choices=SCOPE_CHOICES,
        default='project',
        help_text='Scope: project or office'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text='Parent category for tree structure'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**DB table name:** `budgeting_expensecategory`

**Migration file:** `backend/apps/budgeting/migrations/0001_initial.py` (lines 48-63)

**Fields confirmed:**
- ✅ `name` - CharField(max_length=255)
- ✅ `parent` - ForeignKey to self (tree structure)
- ✅ `scope` - CharField with choices ('project', 'office')
- ✅ `is_active` - BooleanField(default=True)
- ❌ `sort_order` - **NOT FOUND** (no sort_order field exists)

**Proof:** Lines 10-46 in `backend/apps/budgeting/models.py`, Migration lines 48-63

---

### 3) Planning/Budget Models

#### 3.1 PlanPeriod / MonthPeriod

**File:** `backend/apps/planning/models.py`

**PlanPeriod model:**
```python
class PlanPeriod(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='plan_periods')
    period = models.CharField(max_length=7, help_text='Format: YYYY-MM (e.g., 2024-01)')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    locked_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True)
    limit_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `project` → `Project` (CASCADE)
- `created_by` → `User` (SET_NULL)

**File:** `backend/apps/budgeting/models.py`

**MonthPeriod model:**
```python
class MonthPeriod(models.Model):
    month = models.CharField(max_length=7, unique=True, help_text='Format: YYYY-MM')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:** None (standalone model)

**Proof:** 
- PlanPeriod: Lines 9-64 in `backend/apps/planning/models.py`
- MonthPeriod: Lines 53-81 in `backend/apps/budgeting/models.py`

#### 3.2 ProrabPlan / ProrabPlanItem

**File:** `backend/apps/planning/models.py`

**ProrabPlan model:**
```python
class ProrabPlan(models.Model):
    period = models.ForeignKey(PlanPeriod, on_delete=models.CASCADE, related_name='prorab_plans')
    prorab = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='prorab_plans', limit_choices_to={'role': 'foreman'})
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    comments = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `period` → `PlanPeriod` (CASCADE)
- `prorab` → `User` (CASCADE, limit_choices_to={'role': 'foreman'})

**ProrabPlanItem model:**
```python
class ProrabPlanItem(models.Model):
    plan = models.ForeignKey(ProrabPlan, on_delete=models.CASCADE, related_name='items')
    category = models.ForeignKey('budgeting.ExpenseCategory', on_delete=models.CASCADE, related_name='prorab_plan_items')
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `plan` → `ProrabPlan` (CASCADE)
- `category` → `ExpenseCategory` (CASCADE)
- `created_by` → `User` (SET_NULL)

**Proof:** Lines 100-192 in `backend/apps/planning/models.py`

#### 3.3 BudgetPlan / BudgetLine

**File:** `backend/apps/budgeting/models.py`

**BudgetPlan model:**
```python
class BudgetPlan(models.Model):
    period = models.ForeignKey(MonthPeriod, on_delete=models.CASCADE, related_name='budget_plans')
    scope = models.CharField(max_length=20, choices=SCOPE_CHOICES)  # 'OFFICE' or 'PROJECT'
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='budget_plans')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `period` → `MonthPeriod` (CASCADE)
- `project` → `Project` (CASCADE, nullable when scope='OFFICE')
- `approved_by` → `User` (SET_NULL)

**BudgetLine model:**
```python
class BudgetLine(models.Model):
    plan = models.ForeignKey(BudgetPlan, on_delete=models.CASCADE, related_name='lines')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='budget_lines')
    amount_planned = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(0)])
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `plan` → `BudgetPlan` (CASCADE)
- `category` → `ExpenseCategory` (CASCADE)

**Proof:** Lines 84-182 in `backend/apps/budgeting/models.py`

#### 3.4 ActualExpense / ActualItem

**File:** `backend/apps/planning/models.py`

**ActualExpense model:**
```python
class ActualExpense(models.Model):
    project = models.ForeignKey('projects.Project', on_delete=models.CASCADE, related_name='actual_expenses')
    period = models.ForeignKey(PlanPeriod, on_delete=models.SET_NULL, null=True, blank=True, related_name='actual_expenses')
    prorab_plan = models.ForeignKey(ProrabPlan, on_delete=models.SET_NULL, null=True, blank=True, related_name='actual_expenses')
    prorab_plan_item = models.ForeignKey(ProrabPlanItem, on_delete=models.SET_NULL, null=True, blank=True, related_name='actual_expenses')
    category = models.ForeignKey('budgeting.ExpenseCategory', on_delete=models.SET_NULL, null=True, blank=True, related_name='actual_expenses')
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    spent_at = models.DateField()
    comment = models.TextField(blank=False, help_text='Required comment for every expense')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `project` → `Project` (CASCADE)
- `period` → `PlanPeriod` (SET_NULL, optional)
- `prorab_plan` → `ProrabPlan` (SET_NULL, optional)
- `prorab_plan_item` → `ProrabPlanItem` (SET_NULL, optional)
- `category` → `ExpenseCategory` (SET_NULL, optional)
- `created_by` → `User` (SET_NULL)

**File:** `backend/apps/actuals/models.py`

**ActualItem model (LEGACY):**
```python
class ActualItem(models.Model):
    plan_period = models.ForeignKey(PlanPeriod, on_delete=models.CASCADE, related_name='actual_items')
    title = models.CharField(max_length=255)
    category = models.CharField(max_length=100, blank=True)  # String, not FK!
    qty = models.DecimalField(max_digits=12, decimal_places=2)
    unit = models.CharField(max_length=50)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    note = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
```

**FK Relations:**
- `plan_period` → `PlanPeriod` (CASCADE)
- `created_by` → `User` (SET_NULL)

**Proof:**
- ActualExpense: Lines 195-271 in `backend/apps/planning/models.py`
- ActualItem: Lines 9-40 in `backend/apps/actuals/models.py`

---

### 4) Migrations Status

**Command output (from sqlite3 .tables):**
```
audit_auditlog
planning_actualexpense
planning_planitem
planning_planperiod
planning_prorabplan
planning_prorabplanitem
budgeting_budgetline
budgeting_budgetplan
budgeting_budgetplansummarycomment
budgeting_expensecategory
budgeting_monthperiod
projects_project
projects_projectassignment
```

**Migration files found:**
- `backend/apps/planning/migrations/0001_initial.py` - Creates PlanPeriod, ProrabPlan, PlanItem, ProrabPlanItem
- `backend/apps/planning/migrations/0005_actualexpense_and_more.py` - Creates ActualExpense, modifies ProrabPlanItem
- `backend/apps/budgeting/migrations/0001_initial.py` - Creates ExpenseCategory, MonthPeriod, BudgetPlan, BudgetLine
- `backend/apps/projects/migrations/0001_initial.py` - Creates Project, ProjectAssignment
- `backend/apps/audit/migrations/0001_initial.py` - Creates AuditLog

**Mismatch analysis:**
- ✅ All models have corresponding tables
- ⚠️ **ActualItem model exists** (`backend/apps/actuals/models.py`) but **NO migration file found** in `backend/apps/actuals/migrations/` - table may not exist in DB
- ✅ **ActualExpense model** has migration and table exists (`planning_actualexpense`)
- ⚠️ **Actuals app is still registered** in `INSTALLED_APPS` (line 42 in `backend/config/settings.py`) and has URLs (line 10 in `backend/config/api_urls.py`)

**Note:** The `actuals` app is still active (registered in INSTALLED_APPS and has API routes), but ActualItem model may not have a migration file. ActualExpense is the newer model in the `planning` app. Both endpoints exist: `/api/actual-items/` (legacy) and `/api/actual-expenses/` (new).

---

### 5) The DELETE /projects/<id>/ Bug

**File:** `backend/apps/projects/viewsets.py`

**ProjectViewSet.destroy() implementation:**
```python
def perform_destroy(self, instance):
    """Delete project with audit logging."""
    service = ProjectService()
    service.delete(project=instance, user=self.request.user)
```

**File:** `backend/apps/projects/services.py`

**ProjectService.delete() implementation:**
```python
@staticmethod
def delete(project, user):
    """Delete a project."""
    before_state = {
        'id': project.id,
        'name': project.name,
        'status': project.status,
    }
    
    project.delete()
    
    # Audit log
    AuditLogService.log_delete(user, project, before_state)
```

**CASCADE deletion chain:**

1. **Project.delete()** triggers CASCADE deletions:
   - `Project.plan_periods` → **PlanPeriod** (CASCADE) - Line 23 in `backend/apps/planning/models.py`
   - `Project.actual_expenses` → **ActualExpense** (CASCADE) - Line 200 in `backend/apps/planning/models.py`
   - `Project.budget_plans` → **BudgetPlan** (CASCADE) - Line 110 in `backend/apps/budgeting/models.py`
   - `Project.assignments` → **ProjectAssignment** (CASCADE) - Line 45 in `backend/apps/projects/models.py`

2. **PlanPeriod.delete()** triggers:
   - `PlanPeriod.actual_items` → **ActualItem** (CASCADE) - Line 14 in `backend/apps/actuals/models.py`
   - `PlanPeriod.plan_items` → **PlanItem** (CASCADE) - Line 72 in `backend/apps/planning/models.py`
   - `PlanPeriod.prorab_plans` → **ProrabPlan** (CASCADE) - Line 112 in `backend/apps/planning/models.py`

3. **ProrabPlan.delete()** triggers:
   - `ProrabPlan.items` → **ProrabPlanItem** (CASCADE) - Line 157 in `backend/apps/planning/models.py`

**Root cause:** When Project is deleted, it cascades to PlanPeriod, which cascades to ActualItem (if ActualItem table exists). The ActualItem model has `plan_period` FK with CASCADE, so deleting a project will delete all ActualItems linked to that project's PlanPeriods.

**Proof:**
- ProjectViewSet: Lines 50-53 in `backend/apps/projects/viewsets.py`
- ProjectService.delete: Lines 84-95 in `backend/apps/projects/services.py`
- CASCADE relations: See grep results for `on_delete=models.CASCADE`

---

## PART B — REQUIRED BUSINESS LOGIC SPEC (map to code)

### 6) Monthly Plan Container Model

**Answer:** **YES** - Multiple models exist, but they serve different purposes:

**A) PlanPeriod** (`backend/apps/planning/models.py`, lines 9-64)
- **Purpose:** Monthly plan container **per project**
- **Fields:** `project`, `period` (YYYY-MM), `status`, `limit_amount`
- **Scope:** Project-scoped (one per project per month)
- **Used by:** Foreman plans (ProrabPlan), legacy PlanItem

**B) BudgetPlan** (`backend/apps/budgeting/models.py`, lines 84-141)
- **Purpose:** Monthly budget plan **per root category scope** (Office or Project)
- **Fields:** `period` (MonthPeriod FK), `scope` ('OFFICE' or 'PROJECT'), `project` (optional), `status`
- **Scope:** Can be Office-wide OR per-project
- **Used by:** BudgetLine (admin-created budget plans)

**C) MonthPeriod** (`backend/apps/budgeting/models.py`, lines 53-81)
- **Purpose:** Month container for BudgetPlan
- **Fields:** `month` (YYYY-MM), `status` ('OPEN' or 'LOCKED')
- **Scope:** Global (not project-specific)

**Gap:** No single model that matches "Monthly Plan container per root category". BudgetPlan is closest but uses `scope` ('OFFICE'/'PROJECT') rather than category FK.

**Proof:** See model definitions above

---

### 7) Actual Expense Model with Category FK and Required Comment

**Answer:** **YES** - ActualExpense model exists and matches requirements:

**File:** `backend/apps/planning/models.py`, lines 195-271

**Fields:**
- ✅ `category` → `ExpenseCategory` FK (SET_NULL, optional)
- ✅ `comment` → `TextField(blank=False)` - **REQUIRED**
- ✅ `project` → `Project` FK (CASCADE)
- ✅ `amount` → `DecimalField`
- ✅ `spent_at` → `DateField`
- ✅ `created_by` → `User` FK

**Serializer validation:**

**File:** `backend/apps/planning/api/serializers.py`, lines 198-202

```python
def validate_comment(self, value):
    """Validate comment field - must not be empty."""
    if not value or not value.strip():
        raise serializers.ValidationError("Comment is required and cannot be empty.")
    return value.strip()
```

**Proof:** 
- Model: Lines 195-271 in `backend/apps/planning/models.py`
- Serializer validation: Lines 198-202 in `backend/apps/planning/api/serializers.py`

**Note:** ActualExpense.category is **optional** (null=True, blank=True), but comment is **required** (blank=False).

---

### 8) Existing Endpoints

#### 8.1 Categories CRUD

**File:** `backend/apps/budgeting/api/urls.py`

**Route:** `/api/budgets/expense-categories/`

**ViewSet:** `ExpenseCategoryViewSet` (`backend/apps/budgeting/api/views.py`, lines 54-86)

**Permissions:**
- **Read (GET, LIST):** `IsAuthenticated` (all authenticated users)
- **Create/Update/Delete:** `IsAdmin` (admin only)

**Endpoints:**
- `GET /api/budgets/expense-categories/` - List categories
- `GET /api/budgets/expense-categories/<id>/` - Retrieve category
- `POST /api/budgets/expense-categories/` - Create (admin only)
- `PATCH /api/budgets/expense-categories/<id>/` - Update (admin only)
- `DELETE /api/budgets/expense-categories/<id>/` - Delete (admin only)

**Query params:** `scope`, `parent` (filtering)

**Proof:**
- URLs: Lines 10 in `backend/apps/budgeting/api/urls.py`
- ViewSet: Lines 54-86 in `backend/apps/budgeting/api/views.py`
- Permissions: Lines 61-65 in `backend/apps/budgeting/api/views.py`

#### 8.2 Foreman Plan Create/Edit/Submit

**File:** `backend/apps/planning/api/urls.py`

**Routes:**
- `GET /api/prorab/projects/` - List assigned projects
- `GET /api/prorab/projects/<project_id>/plan-periods/` - List plan periods for project
- `GET /api/prorab/plan-periods/<period_id>/plan/` - Get/create prorab plan (auto-creates DRAFT)
- `GET /api/prorab/plans/<plan_id>/items/` - List plan items
- `POST /api/prorab/plans/<plan_id>/items/` - Create plan item
- `PATCH /api/prorab/plans/<plan_id>/items/<id>/` - Update plan item
- `DELETE /api/prorab/plans/<plan_id>/items/<id>/` - Delete plan item
- `POST /api/prorab/plans/<plan_id>/submit/` - Submit plan for approval
- `GET /api/prorab/plans/<plan_id>/summary/` - Get plan summary (planned/spent/remaining)
- `GET /api/prorab/plans/<plan_id>/expenses/` - Get actual expenses for plan

**ViewSets:**
- `ProrabProjectsViewSet` - Lines 168-184 in `backend/apps/planning/api/views.py`
- `ProrabPlanPeriodsViewSet` - Lines 187-208 in `backend/apps/planning/api/views.py`
- `ProrabPlanViewSet` - Lines 211-305 in `backend/apps/planning/api/views.py`
- `ProrabPlanItemViewSet` - Lines 308-407 in `backend/apps/planning/api/views.py`
- `ProrabPlanSubmitView` - Lines 410-436 in `backend/apps/planning/api/views.py`

**Permissions:** `ProrabPlanPermission` (`backend/apps/planning/permissions.py`, lines 108-179)
- Only `foreman` role can access
- Must be assigned to project via `ProjectAssignment`
- Can only edit when `period.status == 'open'` and `plan.status in ('draft', 'rejected')`

**Proof:**
- URLs: Lines 19-39 in `backend/apps/planning/api/urls.py`
- ViewSets: Lines 168-436 in `backend/apps/planning/api/views.py`
- Permissions: Lines 108-179 in `backend/apps/planning/permissions.py`

#### 8.3 Actual Expense Create/List

**File:** `backend/apps/planning/api/urls.py`

**Route:** `/api/actual-expenses/`

**ViewSet:** `ActualExpenseViewSet` (`backend/apps/planning/api/views.py`, lines 439-499)

**Permissions:** `ActualExpensePermission` (`backend/apps/planning/permissions.py`, lines 8-42)
- **Admin/Director:** Full CRUD
- **Foreman:** Read-only (GET only), can only see expenses linked to their own plans (excludes Office project)

**Endpoints:**
- `GET /api/actual-expenses/` - List expenses
- `GET /api/actual-expenses/<id>/` - Retrieve expense
- `POST /api/actual-expenses/` - Create expense (admin/director only)
- `PATCH /api/actual-expenses/<id>/` - Update expense (admin/director only)
- `DELETE /api/actual-expenses/<id>/` - Delete expense (admin/director only)

**Filter fields:** `project`, `period`, `prorab_plan`, `spent_at`

**Proof:**
- URLs: Line 16 in `backend/apps/planning/api/urls.py`
- ViewSet: Lines 439-499 in `backend/apps/planning/api/views.py`
- Permissions: Lines 8-42 in `backend/apps/planning/permissions.py`

**Note:** There is also a legacy `ActualItemViewSet` at `/api/actual-items/` (`backend/apps/actuals/api/urls.py`), but this appears to be deprecated in favor of `ActualExpense`.

---

## PART C — GAP ANALYSIS (no coding yet)

### 9) Minimum Changes Needed

Based on the evidence above, here are the gaps and proposed changes:

#### **KEEP:**

1. **ExpenseCategory model** (`backend/apps/budgeting/models.py`)
   - ✅ Tree structure (parent FK)
   - ✅ Scope field (project/office)
   - ✅ is_active field
   - **Action:** Keep as-is

2. **ActualExpense model** (`backend/apps/planning/models.py`)
   - ✅ Category FK (optional)
   - ✅ Required comment field
   - ✅ Project FK
   - **Action:** Keep as-is (already matches requirements)

3. **ProrabPlan / ProrabPlanItem** (`backend/apps/planning/models.py`)
   - ✅ Foreman plan system exists
   - ✅ Project-scoped (via PlanPeriod → Project)
   - ✅ Category FK on ProrabPlanItem
   - **Action:** Keep as-is

#### **RENAME / REFACTOR:**

1. **BudgetPlan model** → **Rename to MonthlyBudgetPlan** (or keep name, clarify purpose)
   - Currently uses `scope` ('OFFICE'/'PROJECT') instead of category FK
   - **Gap:** Should link to root category instead of scope
   - **Action:** Add `root_category` FK to ExpenseCategory (where parent=None), or keep scope but clarify it represents root category

2. **PlanPeriod model** → **Keep but clarify**
   - Currently project-scoped monthly container
   - Used by foreman plans (ProrabPlan)
   - **Action:** Keep for foreman plans, but clarify it's project-specific

#### **REMOVE / DEPRECATE:**

1. **ActualItem model** (`backend/apps/actuals/models.py`)
   - ❌ Legacy model (no migration found)
   - ❌ Uses string `category` instead of FK
   - ❌ No required comment
   - **Action:** Remove `actuals` app entirely (migrate any data to ActualExpense if needed)

2. **PlanItem model** (`backend/apps/planning/models.py`, lines 67-97)
   - ❌ Uses string `category` instead of FK
   - ❌ Legacy model (superseded by ProrabPlanItem)
   - **Action:** Deprecate or remove (check if still used)

3. **Plan model** (`backend/apps/plans/models.py`) and **PlanItem** (`backend/apps/plan_items/models.py`)
   - ❌ Different purpose (appears to be separate planning system)
   - **Action:** Verify if still needed, may be legacy

#### **ADD / MODIFY:**

1. **Monthly Budget Plan per Root Category**
   - **Gap:** No model that represents "monthly plan per root category"
   - **Options:**
     - **Option A:** Modify `BudgetPlan` to add `root_category` FK (where category.parent=None)
     - **Option B:** Create new `MonthlyCategoryBudget` model
   - **Recommendation:** Option A - add `root_category` FK to BudgetPlan, make `scope` derived from category.scope

2. **Sidebar Categories**
   - **Gap:** Need endpoint to return root categories (parent=None) for sidebar
   - **Action:** Add query param `parent=null` to ExpenseCategoryViewSet (already exists, line 77 in `backend/apps/budgeting/api/views.py`)

3. **Reports: Plan / Actual / Delta / Percent**
   - **Gap:** Need report endpoint that aggregates:
     - Plan amounts (from BudgetPlan → BudgetLine or ProrabPlan → ProrabPlanItem)
     - Actual amounts (from ActualExpense)
     - Calculate delta and percent
   - **Action:** Create new report view/endpoint

4. **Foreman Plan Scope Restriction**
   - **Current:** Foreman can create plans for assigned projects (via ProjectAssignment)
   - **Requirement:** Foreman can ONLY input plan for "Object" (project scope) categories
   - **Gap:** Need validation that ProrabPlanItem.category.scope == 'project' and category.parent != None
   - **Status:** ✅ **ALREADY IMPLEMENTED** - See `ProrabPlanItemSerializer.validate_category()` lines 112-126 in `backend/apps/planning/api/serializers.py`

#### **FIX:**

1. **Project Delete Bug**
   - **Issue:** Deleting Project cascades to ActualItem (if table exists)
   - **Fix:** Change ActualItem.plan_period FK from CASCADE to SET_NULL or PROTECT
   - **OR:** Remove ActualItem model entirely (recommended)

---

### **Summary of Changes:**

| Change | Type | Files Affected | Reason |
|--------|------|----------------|--------|
| Remove `actuals` app | Remove | `backend/apps/actuals/` | Legacy, replaced by ActualExpense |
| Deprecate `PlanItem` (planning) | Remove | `backend/apps/planning/models.py` | Legacy, replaced by ProrabPlanItem |
| Add `root_category` FK to BudgetPlan | Modify | `backend/apps/budgeting/models.py` | Link monthly plan to root category |
| Create report endpoint | Add | `backend/apps/reports/api/views.py` | Plan vs Actual comparison |
| Fix Project delete cascade | Modify | `backend/apps/actuals/models.py` OR remove app | Prevent accidental deletion |

---

**END OF REPORT**

