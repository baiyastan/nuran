---
name: planning-lifecycle
description: State machine and role permissions for PlanPeriod, PlanItem, and ProrabPlan in the nuran app. Use when adding/modifying approval actions (submit, approve, reject, lock, unlock), verifying who can edit at which stage, writing tests for cross-user isolation, diagnosing "why can't a foreman see this", or ensuring state-change actions write AuditLog and support idempotency. Covers the full status diagram per entity, role × action matrix, editability rules, rejection-with-reason flow, and the rule that EVERY state transition must audit + be idempotent. Triggers on 'approve plan', 'submit plan', 'lock period', 'reject prorab plan', 'can foreman approve', 'why is this 403', 'double-click approve', 'audit not written for unlock', 'cross-foreman leak'.
type: domain
---

# План жашоо цикли — эрежелер

`PlanPeriod`, `PlanItem`, `ProrabPlan` (жана `ProrabPlanItem`) үчүн статус жашоо цикли, ролго негизделген уруксаттар, жана ар бир статус өзгөрүүсүнүн милдеттүү audit + idempotency эрежелери.

Негизги инвариант: **бардык статус өзгөрүүлөрү** — (a) роль текшерет, (b) `AuditLog`'ка жазат, (c) эки жолу чакырылса коопсуз.

## 0. Долбоор конвенцияларын эскертүү

- Роль булагы: `apps.users.models.User.ROLE_CHOICES` = `admin` / `director` / `foreman`
- Audit булагы: `apps.audit.models.AuditLog` — `action` ∈ {`create`, `update`, `delete`, `approve`, `lock`, `submit`}. Башка action керек болсо — адегенде choices'ти кеңейт.
- Primary key — `BigAutoField` (int). UUID эмес.

## 1. `PlanPeriod` — айлык план контейнери

### Статустар

4 реалдуу статус + 1 легаси: `draft`, `submitted`, `approved`, `locked`, ~~`open`~~ (`save()` ичинде `draft`'ка автомат которулат, жаңы код жазбайт).

### Өтүү таблицасы

| Өтүү | Баштапкы | Максат | Кимге уруксат | Код жайгашуусу |
|---|---|---|---|---|
| `submit` | `draft` | `submitted` | `foreman` (өзү жараткан) же `admin` | `services.py:113` |
| `approve` | `submitted` | `approved` | `director` же `admin` | `services.py:133` |
| `return_to_draft` | `submitted` же `approved` | `draft` | `director` же `admin` | `services.py:155` |
| `lock` | `approved` | `locked` | `admin` гана | `services.py:176` |
| `unlock` | `locked` | `draft` | `admin` гана | ⚠️ `views.py:195` — **audit жазбайт** |

Башка бардык өтүүлөр ТЫЮУ (мис. `locked → submitted`).

### `fund_kind` эрежеси

- `project` — `project` FK милдеттүү
- `office`, `charity` — `project = None` талап кылынат
- `UniqueConstraint`: `(project, period)` ичинде, `(fund_kind, period)` `office/charity` үчүн

### Легаси: `open` статусу

`open` — эски статус, `save()` ичинде автомат `draft`'ка которулат. Жаңы код эч качан `open` колдонбошу керек.

### Редакциялоо эрежеси

- `draft` абалында — эркин өзгөртүлөт
- `submitted`, `approved` — field-level жаңыртуу ТЫЮУ, `return_to_draft` чакыруу керек
- `locked` — толук иммутабелдик, `unlock` (admin) аркылуу гана

## 2. `PlanItem`

### ⚠️ Терминологиялык мисматч

`PlanItem` моделинин docstring'ин "append-only entries" деп атайт (`models.py:127`), бирок permissions эрежеси update'ту foreman жана admin'ге уруксат берет. **Код менен документ туш келбейт** — docstring адаштырат. Жаңы код үчүн реалдуу эрежени карагыла:

### Кимге уруксат

| Аракет | admin | director | foreman | Эскертүү |
|---|---|---|---|---|
| Read | ✓ | ✓ | ✓ | Бардык auth колдонуучу |
| Create | ✓ | ❌ | ✓ | `services.py:206` director create ТЫЮУ |
| Update | ✓ | ⚠️ | ✓ | Director — `draft` абалында гана |
| Delete | ✓ | ❌ | ❌ | Admin гана |

### Валидация эрежелери

- `amount` милдеттүү; **`amount > 0`** — `plan-fact-linking §2`'ни кара (азыр serializer validation жок — оңдоо керек)
- `plan_period.status == 'locked'` болсо → create/update ТЫЮУ (`assert_plan_editable` текшерет)

Толук валидация эрежелери үчүн — [plan-fact-linking](../plan-fact-linking/SKILL.md) §1-4.

## 3. `ProrabPlan` — прораб планы

Бир `(period, prorab)` жуптугуна **бир эле** ProrabPlan болот (`unique_together`).

### Статустар

```
draft ──submit──► submitted ──approve──► approved
  ▲                    │
  │                    │
  └──────reject────────┘  (rejection_reason + comments)
```

### Өтүү эрежелери

| Өтүү | Кимге уруксат | Азыркы абал |
|---|---|---|
| `submit` | `foreman` (өзү) | ✓ `services.py:356` |
| `approve` | **`admin` гана** | ⚠️ endpoint жок (audit #1) — кошуу керек |
| `reject` | **`admin` гана** | ⚠️ endpoint жок — кошуу керек |
| `re-edit after reject` | `foreman` (өзү) | `can_edit` кайтарат (`services.py:341`) |

**Чечим (2026-04-23)**: approve жана reject — **`admin` гана**. Admin бардыгын көрөт, бардыгын чечет (барьер машина моделине ылайык). Director эмне үчүн `PlanPeriod`'ду approve кылат — бул жалпы period, ар бир прораб планы эмес.

### Approve/reject endpoint'тери кошулганда

- `approve`: `submitted → approved`, `approved_at` толтурулат. **Лимит ашканын блоктобойт** — бул админдин чечими (§5 карагыла).
- `reject`: `submitted → rejected`, `rejected_at` + `rejection_reason` (жаңы field керек) + `comments`
- Прораб `rejected` планды кайра жөнөтөр алдында reason'ду көрөт

### Rejected планга факт жазылабы?

**Ооба, жазылат.** Факт план статусуна көз каранды эмес — [plan-fact-linking](../plan-fact-linking/SKILL.md) §9b карагыла.

### Ownership — cross-prorab изоляция

`ProrabPlanViewSet.get_queryset` ичинде **`prorab=request.user`** фильтри милдеттүү. Башка прораб'тын планын көрүү же өзгөртүү → 403/404.

**Тест керек** (audit #15):
```python
def test_foreman_cannot_see_other_foreman_plan():
    fm_a, fm_b = ForemanFactory(), ForemanFactory()
    plan = ProrabPlanFactory(prorab=fm_b)
    r = client(fm_a).get(f'/api/v1/prorab-plans/{plan.id}/')
    assert r.status_code in (403, 404)
```

## 4. Foreman scope — ProjectAssignment боюнча чектелет

`ProrabPlan` жана `ProrabPlanItem` — **`project` fund_kind'и бар `PlanPeriod`гo гана** тийиштүү (`permissions.py:225`).

### Эреже (2026-04-23 чечими)

**Foreman өзүнө `ProjectAssignment` аркылуу бекитилген обьекттердин гана:**
- Планын жазат
- Ошол обьектке кеткен чыгымдарын (ActualExpense / Expense) көрөт
- Башка прораб'тын / башка обьекттин планын жана чыгымдарын **КӨРБӨЙТ**

### Кайда оңдолушу керек

| Жер | Учурдагы | Туура |
|---|---|---|
| `ProrabProjectsViewSet.get_queryset` (`views.py:294`) | Бардык активдүү долбоорлор | `ProjectAssignment.objects.filter(prorab=request.user).values_list('project_id')` боюнча фильтр |
| `ProrabPlanViewSet.get_queryset` (`views.py:337`) | `prorab=request.user` ✓ | жакшы, бирок `ProjectAssignment` аркылуу period'тун проектин да текшерүү |
| `ActualExpense` жана `Expense` foreman визибилдик | `fund_kind='project'` гана (`permissions.py:38`) | **+ `ProjectAssignment` боюнча** filter кошуу |

### Тест керек

```python
def test_foreman_sees_only_assigned_projects():
    fm = ForemanFactory()
    assigned_project = ProjectFactory()
    other_project = ProjectFactory()
    ProjectAssignmentFactory(prorab=fm, project=assigned_project)
    r = client(fm).get('/api/v1/prorab-plans/')
    # only assigned_project's plans visible
```

## 5. `PlanPeriod.limit_amount` — жөн гана бюджет ориентири

### Негизги эреже (2026-04-23)

**План = эстимация, факт = реалдуулук.** `limit_amount` — БЛОК эмес, **маалымат**. Прораб лимиттен ашыкча план жазышы мүмкүн; факт да лимиттен же план суммасынан ашышы мүмкүн — экөө тең тыюу салынган эмес.

### Эрежелер

| Эреже | Детал |
|---|---|
| Кимге жазат | `admin` |
| Submit учурунда блоктойбу | **Жок** — прораб ашыкча планды да submit кылат |
| Approve учурунда блоктойбу | **Жок** — админ lim ашык көрүп, өзү чечим берет (approve же reject) |
| Admin reject кыла алат | Ооба — overshoot себеп катары (`rejection_reason`'до) |
| `limit_amount = None` | Чек жок, админ каалаганча approve кылат |

### Код тарабынан

- `ProrabPlanService.check_limit_amount` (`services.py:389`) азыр submit'ти блоктойт → **оңдоо керек**: ValidationError ордуна warning return кылуу же админге көрсөтүү үчүн flag кайтаруу
- Serializer response'то `is_over_limit: bool` field пайда болсун — админ дашбордунда көрсөтүлөт

### Эмне блоктолбойт

- ✅ План > limit_amount — submit ошого карабай OK
- ✅ Факт > план суммасы — жазыла берет (`plan-fact-linking §9b`)
- ✅ Факт > limit_amount — жазыла берет

### Эмне блоктолот (өзгөрбөйт)

- ❌ `PlanPeriod.status == 'locked'` — жаңы факт кошуу ТЫЮ (`plan-fact-linking §4`)
- ❌ `amount <= 0` бардык жерде (`plan-fact-linking §2`)

## 6. Audit жазуу — МИЛДЕТТҮҮ эреже

**Бардык** статус өзгөртүүлөрү `AuditLog.objects.create(...)` жазат. Айырмаланган жок.

```python
AuditLog.objects.create(
    actor=user,
    action='submit',  # же 'approve', 'update' (lock/unlock), 'delete'
    model_name='PlanPeriod',  # же 'PlanItem', 'ProrabPlan'
    object_id=plan_period.id,
    before={'status': 'draft'},
    after={'status': 'submitted', 'submitted_at': '2026-04-23T10:00:00'},
)
```

**Азыркы абал:** submit/approve/lock audit жазат; `unlock` (`apps/planning/api/views.py:195-206`) ЖАЗБАЙТ — **оңдоо керек** (audit #3).

**Эгер `action='reject'` же `action='unlock'` керек болсо** — адегенде `apps/audit/models.py` ичиндеги `ACTION_CHOICES`'ке кошуу. Болбосо `update` колдонуп, `before/after` JSON'до чыныгы action'ду жазса болот.

## 7. Idempotency — МИЛДЕТТҮҮ эреже

State-change endpoint'тери эки жолу басылса — коопсуз болуш керек. Үч жол:

### (a) Status гард (азыркысы)
Учурдагы абал текшерилет, `submit` `submitted` абалында экинчи жолу чакырылса ValidationError. **Маселе**: колдонуучу "катa" деп ойлойт.

### (b) "Already-in-target" сылаштыруу (сунушталат)
Эгер учурдагы абал max target болсо — `200 OK` + `{"already": true}` кайтаруу, катa эмес:

```python
def approve(plan_period, user):
    if plan_period.status == 'approved':
        return plan_period, {'already_approved': True}
    if plan_period.status != 'submitted':
        raise ValidationError(...)
    # ... туура approve логикасы
```

### (c) Idempotency-Key header (узак мөөнөттүү)
Long-term чечим: `Idempotency-Key` UUID header + server-side cache (см. audit #5). Азырынча (b) жетиштүү.

**Frontend эреже**: submit кнопкасы `isSubmitting` флагы менен disabled болот; request учурунда кайра чыкылдатуу мүмкүн эмес.

## 8. Edge cases: легаси код

`apps/plans/` модулу deprecated (CLAUDE.md'де жазылган). Жаңы код бул app'тан **эч нерсе импортобошу керек**. Күнү бир өчүрүлөт (ошол PR өзүнчө болот).

Learned: `PlanPeriod.status = 'open'` да легаси, `save()` аны `draft`'ка алмаштырат. Жаңы код `open` жазбайт.

## 9. Testing checklist (бул скилл үчүн)

- [ ] Cross-foreman изоляция — foreman_A → foreman_B'нин ProrabPlan'ын көрө албайт (`get/patch/delete` 3 учур)
- [ ] Director PlanItem'ди `draft` абалында гана өзгөртөт, `submitted/approved`'то 403
- [ ] Director PlanItem жарата албайт (POST → 403)
- [ ] Foreman өзүнүн PlanPeriod'ун submit кылганы үчүн кайра submit → `already_submitted` 200 (же 400 clear текст менен)
- [ ] Admin unlock кылганы `AuditLog` жазат
- [ ] ProrabPlan approve/reject endpoint'тери ишке келгенде:
  - [ ] Admin approve кыла алат
  - [ ] Foreman өз планын approve кыла албайт (**403**)
  - [ ] Director approve кыла албайт (**403**) — себеби `ProrabPlan` админдин уруксаты
  - [ ] Reject кылганда `rejection_reason` талап кылынат (400 empty)
  - [ ] Rejected план кайра `submit` кылганда жаңы `rejected_at` тазаланат

## 10. Милдеттүү оңдоолор (audit жыйынтыгы)

Бул скилл төмөнкүлөргө негиз:

| # | Эмне | Файл |
|---|---|---|
| 1 | ProrabPlan approve/reject endpoint | `apps/planning/api/views.py` + `services.py` |
| 2 | PlanItem `validate_amount > 0` | `apps/planning/api/serializers.py` |
| 3 | `unlock` audit жазуу | `apps/planning/api/views.py:195-206` |
| 4 | "Already in target" idempotent жооп | `apps/planning/services.py` (approve/submit/lock) |
| 5 | Cross-foreman изоляция тести | `backend/tests/test_planning_permissions.py` |
| 6 | ProrabPlan `rejection_reason` field + migration | `apps/planning/models.py` |

Ар бир оңдоо коддо **бул скиллди цитаталап** (мис. "per planning-lifecycle §5") кошулат.
