# CATEGORY SYSTEM FORENSIC VERIFICATION REPORT

**Date:** 2026-02-04  
**Goal:** Verify category system prevents Office/Project mixing and sidebar shows root categories correctly

---

## A) FINDINGS (with proofs)

### 1) SCOPE FIELD VISIBILITY / CONTROL

#### 1a) Is the `scope` field always visible?

**ANSWER: YES**

**Proof:**
- **File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
- **Lines:** 82-96
- **Code snippet:**
```tsx
<div className="form-field">
  <label className="input-label">
    Scope <span style={{ color: '#dc3545' }}>*</span>
  </label>
  <select
    className="input"
    value={formData.scope}
    onChange={(e) =>
      setFormData({
        ...formData,
        scope: e.target.value as 'project' | 'office',
        parent: null, // Reset parent when scope changes
      })
    }
    required
  >
    <option value="project">Project</option>
    <option value="office">Office</option>
  </select>
</div>
```

**Finding:** Scope field is ALWAYS visible and editable, regardless of whether a parent is selected.

---

#### 1b) Is it visible even when creating a CHILD category (parent != null)?

**ANSWER: YES**

**Proof:**
- **File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
- **Lines:** 99-118 (Parent Category field comes AFTER scope field)
- **Code snippet:**
```tsx
<div className="form-field">
  <label className="input-label">Parent Category (optional)</label>
  <select
    className="input"
    value={formData.parent || ''}
    onChange={(e) =>
      setFormData({
        ...formData,
        parent: e.target.value ? Number(e.target.value) : null,
      })
    }
  >
    <option value="">None (Root Category)</option>
    {rootCategories?.results.map((cat) => (
      <option key={cat.id} value={cat.id}>
        {cat.name}
      </option>
    ))}
  </select>
</div>
```

**Finding:** Scope field (lines 82-96) appears BEFORE parent field (lines 99-118), so scope is visible even when parent is selected. There is NO conditional hiding of scope when parent != null.

---

#### 1c) Can a user set scope manually for children?

**ANSWER: YES - NO VALIDATION PREVENTS THIS**

**Proof - Frontend:**
- **File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
- **Lines:** 54-59 (submit handler)
- **Code snippet:**
```tsx
await createCategory({
  name: formData.name.trim(),
  scope: formData.scope,  // ← User can set ANY scope
  parent: formData.parent || null,  // ← Even if parent exists
}).unwrap()
```

**Proof - Backend Serializer:**
- **File:** `backend/apps/budgeting/api/serializers.py`
- **Lines:** 58-62
- **Code snippet:**
```python
def validate_scope(self, value):
    """Validate scope field."""
    if value not in ['project', 'office']:
        raise serializers.ValidationError("Scope must be 'project' or 'office'.")
    return value
```

**Finding:** Backend only validates scope is one of the two values, but does NOT check if it matches parent.scope.

**Proof - Backend Model:**
- **File:** `backend/apps/budgeting/models.py`
- **Lines:** 10-50
- **Finding:** ExpenseCategory model has NO `clean()` method to enforce scope inheritance.

**VIOLATION:** User can create a child category with scope='office' even if parent has scope='project' (or vice versa).

---

### 2) SIDEBAR DATA SOURCE (ROOT LIST)

#### 2a) What exact query does the sidebar use to fetch categories?

**ANSWER: SIDEBAR DOES NOT FETCH CATEGORIES**

**Proof:**
- **File:** `frontend/src/widgets/sidebar/Sidebar.tsx`
- **Lines:** 1-65
- **Finding:** Sidebar only contains navigation links (Projects, Plan Periods, Users). It does NOT display categories.

**However, categories ARE fetched in other components:**

**Proof - Actual Expense Form:**
- **File:** `frontend/src/features/actual-expense-create/CreateActualExpenseForm.tsx`
- **Lines:** 43-46
- **Code snippet:**
```tsx
// Fetch root categories filtered by scope
const { data: rootCategories } = useListExpenseCategoriesQuery({
  scope: formData.scope,
  parent: null,
})
```

**Proof - Category Create Modal:**
- **File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
- **Lines:** 29-32
- **Code snippet:**
```tsx
const { data: rootCategories } = useListExpenseCategoriesQuery({
  scope: formData.scope,
  parent: null,
})
```

**Backend Endpoint:**
- **File:** `backend/apps/budgeting/api/views.py`
- **Lines:** 132-151
- **Code snippet:**
```python
def get_queryset(self):
    """Filter categories by scope and parent."""
    queryset = ExpenseCategory.objects.filter(is_active=True)
    scope = self.request.query_params.get('scope')
    parent = self.request.query_params.get('parent')
    
    if scope:
        queryset = queryset.filter(scope=scope)
    
    if parent is not None:
        if parent == 'null':
            queryset = queryset.filter(parent__isnull=True)
        else:
            try:
                parent_id = int(parent)
                queryset = queryset.filter(parent_id=parent_id)
            except ValueError:
                pass
    
    return queryset.select_related('parent').order_by('name')  # ← VIOLATION: orders by 'name', not 'created_at'
```

**VIOLATIONS:**
1. **Ordering:** Backend orders by `'name'` (line 151), but requirement is `created_at ASC`
2. **Sidebar:** No sidebar component exists that displays root categories. Requirement states "Sidebar must show ONLY root categories"

---

### 3) REPRODUCIBLE MIXING BUG

#### 3a) Steps to Reproduce

**Step 1:** Create root category with scope='project'
```
POST /api/budgets/expense-categories/
{
  "name": "Object",
  "scope": "project",
  "parent": null
}
```

**Step 2:** Create child category with scope='office' (MIXING BUG)
```
POST /api/budgets/expense-categories/
{
  "name": "Office Supplies",
  "scope": "office",  // ← DIFFERENT from parent!
  "parent": 1  // ← Parent is "Object" with scope='project'
}
```

**Result:** ✅ **SUCCESS** - Backend accepts this invalid data!

#### 3b) Example Payloads

**Valid payload that SHOULD be rejected but IS ACCEPTED:**
```json
{
  "name": "Office Material",
  "scope": "office",
  "parent": 1  // Where parent.id=1 has scope='project'
}
```

**Another example:**
```json
{
  "name": "Project Equipment",
  "scope": "project",
  "parent": 2  // Where parent.id=2 has scope='office'
}
```

#### 3c) Current Backend Behavior

**ANSWER: BACKEND ALLOWS SCOPE MISMATCH**

**Proof - Serializer Validation:**
- **File:** `backend/apps/budgeting/api/serializers.py`
- **Lines:** 34-62
- **Finding:** `ExpenseCategorySerializer` has:
  - `validate_scope()` - only checks value is 'project' or 'office' (lines 58-62)
  - NO `validate()` method to check parent.scope matching
  - NO validation that enforces `child.scope == parent.scope`

**Proof - Model Validation:**
- **File:** `backend/apps/budgeting/models.py`
- **Lines:** 10-50
- **Finding:** `ExpenseCategory` model has NO `clean()` method.

**Proof - ViewSet:**
- **File:** `backend/apps/budgeting/api/views.py`
- **Lines:** 119-151
- **Finding:** `ExpenseCategoryViewSet` uses standard DRF `perform_create()` which calls serializer validation only. No additional validation.

#### 3d) Missing Validation Location

**ANSWER: ALL THREE LOCATIONS ARE MISSING VALIDATION**

1. **Model.clean():** ❌ MISSING
   - **File:** `backend/apps/budgeting/models.py`
   - **Lines:** 10-50
   - **Current:** No `clean()` method exists

2. **Serializer.validate():** ❌ MISSING
   - **File:** `backend/apps/budgeting/api/serializers.py`
   - **Lines:** 34-62
   - **Current:** Only has `validate_scope()` which checks value format, not parent matching

3. **ViewSet.perform_create():** ❌ MISSING
   - **File:** `backend/apps/budgeting/api/views.py`
   - **Lines:** 119-151
   - **Current:** Uses default DRF behavior, no custom validation

---

## B) VIOLATIONS vs REQUIRED RULES

### Rule 1: Scope Inheritance
**Required:** If parent != null, child.scope MUST equal parent.scope and scope MUST NOT be user-editable.

**Violations:**
- ❌ Frontend allows editing scope even when parent is selected (`CreateCategoryModal.tsx` lines 82-96)
- ❌ Backend serializer does NOT validate `child.scope == parent.scope`
- ❌ Backend model has NO `clean()` method to enforce this

### Rule 2: Sidebar Root Categories
**Required:** Sidebar MUST fetch only root categories: parent IS NULL and is_active=true. Ordering MUST be created_at ASC.

**Violations:**
- ❌ **NO SIDEBAR COMPONENT EXISTS** that displays categories
- ❌ Backend orders by `'name'` instead of `'created_at'` (`ExpenseCategoryViewSet.get_queryset()` line 151)

### Rule 3: Prevent Mixing
**Required:** Backend MUST enforce: if parent exists -> child.scope = parent.scope

**Violations:**
- ❌ Backend allows creating child with different scope than parent
- ❌ No validation at model, serializer, or viewset level

---

## C) MINIMAL FIX PLAN

### Backend Fixes

#### Fix 1: Add Model Validation
**File:** `backend/apps/budgeting/models.py`
**Location:** Add `clean()` method to `ExpenseCategory` class (after line 50)

```python
def clean(self):
    """Validate scope inheritance from parent."""
    from django.core.exceptions import ValidationError
    
    if self.parent is not None:
        # Child must inherit parent's scope
        if self.scope != self.parent.scope:
            raise ValidationError({
                'scope': f'Child category scope must match parent scope. Parent has scope="{self.parent.scope}", but child has scope="{self.scope}".'
            })
```

#### Fix 2: Add Serializer Validation
**File:** `backend/apps/budgeting/api/serializers.py`
**Location:** Add `validate()` method to `ExpenseCategorySerializer` class (after line 62)

```python
def validate(self, data):
    """Validate scope matches parent scope."""
    parent = data.get('parent')
    scope = data.get('scope')
    
    # If parent is provided, scope must match parent.scope
    if parent is not None:
        if scope != parent.scope:
            raise serializers.ValidationError({
                'scope': f'Scope must match parent scope. Parent "{parent.name}" has scope="{parent.scope}", but provided scope="{scope}".'
            })
    
    return data
```

#### Fix 3: Fix Ordering for Root Categories
**File:** `backend/apps/budgeting/api/views.py`
**Location:** Line 151, change ordering

```python
# OLD:
return queryset.select_related('parent').order_by('name')

# NEW:
# If filtering by parent=null (root categories), order by created_at ASC
if parent == 'null':
    return queryset.select_related('parent').order_by('created_at')
else:
    return queryset.select_related('parent').order_by('name')
```

### Frontend Fixes

#### Fix 4: Hide/Disable Scope When Parent Selected
**File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
**Location:** Lines 78-97, modify scope field

```tsx
<div className="form-field">
  <label className="input-label">
    Scope <span style={{ color: '#dc3545' }}>*</span>
  </label>
  {formData.parent ? (
    // If parent is selected, show scope as read-only (inherited from parent)
    <input
      type="text"
      className="input"
      value={rootCategories?.results.find(c => c.id === formData.parent)?.scope || formData.scope}
      disabled
      readOnly
    />
  ) : (
    // If no parent, allow scope selection
    <select
      className="input"
      value={formData.scope}
      onChange={(e) =>
        setFormData({
          ...formData,
          scope: e.target.value as 'project' | 'office',
          parent: null,
        })
      }
      required
    >
      <option value="project">Project</option>
      <option value="office">Office</option>
    </select>
  )}
</div>
```

#### Fix 5: Auto-set Scope from Parent
**File:** `frontend/src/features/expense-category-create/CreateCategoryModal.tsx`
**Location:** Add useEffect after line 43

```tsx
// Auto-set scope from parent when parent changes
useEffect(() => {
  if (formData.parent && rootCategories?.results) {
    const parentCategory = rootCategories.results.find(c => c.id === formData.parent)
    if (parentCategory) {
      setFormData(prev => ({
        ...prev,
        scope: parentCategory.scope
      }))
    }
  }
}, [formData.parent, rootCategories])
```

#### Fix 6: Create Sidebar Component (if required)
**File:** `frontend/src/widgets/sidebar/Sidebar.tsx` (or new component)
**Location:** Add category list section

```tsx
// Add to Sidebar component or create CategoriesSidebar component
const { data: rootCategories } = useListExpenseCategoriesQuery({
  parent: null,
  // Note: Don't filter by scope - show all root categories
})

// Display root categories ordered by created_at
{rootCategories?.results.map(cat => (
  <li key={cat.id}>
    <NavLink to={`/categories/${cat.id}`}>
      {cat.name}
    </NavLink>
  </li>
))}
```

---

## D) EXACT FILES TO CHANGE

### Backend Files:
1. **`backend/apps/budgeting/models.py`**
   - **Line:** After line 50
   - **Change:** Add `clean()` method to `ExpenseCategory` class

2. **`backend/apps/budgeting/api/serializers.py`**
   - **Line:** After line 62
   - **Change:** Add `validate()` method to `ExpenseCategorySerializer` class

3. **`backend/apps/budgeting/api/views.py`**
   - **Line:** 151
   - **Change:** Modify ordering logic to use `created_at` for root categories

### Frontend Files:
4. **`frontend/src/features/expense-category-create/CreateCategoryModal.tsx`**
   - **Lines:** 78-97 (scope field)
   - **Change:** Conditionally hide/disable scope when parent is selected
   - **Lines:** After line 43
   - **Change:** Add useEffect to auto-set scope from parent

5. **`frontend/src/widgets/sidebar/Sidebar.tsx`** (if sidebar categories are required)
   - **Change:** Add category list fetching and display (or create separate component)

---

## SUMMARY

**Critical Issues Found:**
1. ✅ **SCOPE MIXING BUG CONFIRMED** - Backend allows child categories with different scope than parent
2. ✅ **NO VALIDATION** at model, serializer, or viewset level
3. ✅ **FRONTEND ALLOWS** manual scope editing even when parent is selected
4. ✅ **SIDEBAR DOES NOT EXIST** - No component displays root categories
5. ✅ **ORDERING VIOLATION** - Backend orders by 'name' instead of 'created_at'

**Fix Priority:**
1. **HIGH:** Add backend validation (model + serializer) to prevent mixing
2. **HIGH:** Fix frontend to auto-inherit scope from parent
3. **MEDIUM:** Fix ordering for root categories
4. **LOW:** Create sidebar component (if required by business)

---

**END OF REPORT**

