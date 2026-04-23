---
name: plan-fact-linking
description: Validation and linking rules for ActualExpense / Expense records against planning entities (PlanPeriod, PlanItem, ProrabPlan) in the nuran app. Use when recording a new expense/actual, verifying spent_at falls inside the period, enforcing month-lock, picking a category (no silent "Башка" auto-assignment), or reconciling plan-vs-fact reports. Covers the 4-layer validation stack (model.clean → serializer → service → permission), the amount > 0 rule, spent_at ∈ period bounds rule, month-lock immutability rule, comment-required rule, category explicitness rule, and the plan_item_id foreign-key rigor on Expense. Triggers on 'create actual expense', 'can you spend after lock', 'auto-assign category', 'why was this expense rejected', 'spent_at validation', 'expense amount zero', 'plan vs fact report', 'Expense link to PlanItem'.
type: domain
---

# Факт план менен кантип байланышат — эрежелер

`ActualExpense` жана `Expense` моделдери планоо (`PlanPeriod`, `PlanItem`, `ProrabPlan`, `ProrabPlanItem`) менен кантип байланышат, эмне текшерилет, ЭМНЕ ТЫЮУ САЛЫНАТ.

Негизги принцип: **факт жаңылыгы пландын ичинде жашайт**. Фактты "планга таандык эмес жерге" жазуу — каталык.

## 0. Эки моделдин өз ара айырмасы

| | `ActualExpense` | `Expense` |
|---|---|---|
| Кайда | `apps/planning/models.py:263` | `apps/planning/models.py:369` |
| Негизги FK | `finance_period` (required) | `plan_period` + `plan_item` (экөө required) |
| Кимдин киргизген | Admin гана | Admin + director read |
| Прораб план менен байланыш | Опциондуу (`prorab_plan`, `prorab_plan_item`) | Жок — түздөн-түз `plan_item` |
| Use case | Финансы периоддогу чыгым | PlanItem бойунча катуу бюджет көзөмөлү |
| Биринчи суммасы | Бир PlanItem-ди бир нече Expense камтышы мүмкүн | Бир ActualExpense бир prorab_plan_item'ге тийиштүү |

**Eрежедеги эсте: `Expense.plan_item` — `null=False`** (катуу FK). `ActualExpense`тин FK'лары баары `null=True` — бирок бул ЭРКИН эмес, анда да бизнес эрежелери талап кылат.

## 1. Валидация катмарлары (4 деңгээл)

Ар бир факт жазуу үчүн валидация **4 жерде** болушу керек — defense-in-depth:

```
┌─ 1. Model.clean() ──────────┐  Эгерде кимдир бирөө .create() түз чакырса
│                              │
├─ 2. Serializer.validate_*() ┤  Frontend'тин жаңылыгын кармайт
│                              │
├─ 3. Service function ───────┤  Бизнес эрежелери + transaction
│                              │
└─ 4. Permission class ───────┘  Роль/статус текшерет
```

Эгер бирөөсү текшербей калса — бошоп, кийин catastrophic bug'ка алып келет.

## 2. Эреже: `amount > 0` (ар бир жерде)

`ActualExpense.amount`, `Expense.amount`, `PlanItem.amount`, `ProrabPlanItem.amount`, `PlanPeriod.limit_amount` — баары **> 0**.

### Учурдагы абал (аудитте #2, #13 табылган)

| Модель | Model | Serializer | Service |
|---|---|---|---|
| `Expense.amount` | ✓ `MinValueValidator(Decimal("0.01"))` | ✓ `validate_amount` | ✓ |
| `ActualExpense.amount` | ❌ validator жок | ✓ `validate_amount` | ✓ |
| `PlanItem.amount` | ❌ | **❌ оңдоо керек** | ✓ |
| `ProrabPlanItem.amount` | ❌ | ✓ | ✓ |
| `PlanPeriod.limit_amount` | ❌ | ❌ | ✓ |

**Сунуш**: 4 катмардын тең 4үндө тең текшерүү.

### Serializer мисалы

```python
class PlanItemSerializer(serializers.ModelSerializer):
    def validate_amount(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError("Сумма 0'дон көп болууга тийиш.")
        return value
```

### Model мисалы

```python
amount = models.DecimalField(
    max_digits=12, decimal_places=2,
    validators=[MinValueValidator(Decimal("0.01"))],
)
```

## 3. Эреже: `spent_at` периоддун ай чегинде жатат

### Проблема (audit #4)

Учурда `ActualExpense.spent_at` жана `Expense.spent_at` — **эч ким** периоддун ай чегинде экенин текшербейт. 2026-01 перидиндеги планга 2026-02 датасында чыгым жазылышы мүмкүн — шексиз.

### Эреже

`ActualExpense`:
- `spent_at` — `finance_period.month_period.month` менен ай жагынан дал келет. Мис. `finance_period.month_period.month = '2026-04'` → `spent_at` `2026-04-01..2026-04-30` ичинде
- Эгер `period` (PlanPeriod) кошумча берилсе — ошондой эле `period.period == '2026-04'`'ка дал келет

`Expense`:
- `spent_at` — `plan_period.period` ай менен дал келет
- `plan_item.plan_period == plan_period` — FK ырааттуу болуш керек

### Model мисалы (`ActualExpense.clean()`)

```python
def clean(self):
    super().clean()
    # ... эски logic
    if self.spent_at and self.finance_period:
        fp_month = self.finance_period.month_period.month  # 'YYYY-MM'
        if self.spent_at.strftime('%Y-%m') != fp_month:
            raise ValidationError({
                'spent_at': f'spent_at {self.spent_at} must be in {fp_month}.'
            })
```

## 4. Эреже: `locked` PlanPeriod — ТЫЮУ

Эгер `PlanPeriod.status == 'locked'` болсо → ал периодго **жаңы факт жазуу ТЫЮУ САЛЫНАТ**, бар фактты өзгөртүү да ТЫЮУ.

### Учурдагы абал

- `Expense` жарайт `plan_period.status != 'locked'` болгондо (`permissions.py:ExpensePermission` + service)
- `ActualExpense` — `finance_period` аркылуу кетет; айырмачылык бар: `FinancePeriod` өзүнчө lock'ка ээ болуусу мүмкүн

### Текшерүү

`ActualExpenseService.create(...)` жана `ExpenseService.create(...)` ичинде:
```python
if plan_period and not is_plan_period_editable(plan_period):
    raise ValidationError("Locked period — жаңы чыгым кошулбайт.")
```

### Admin `unlock` кылса эмне болот?

`unlock` → `locked` → `draft`. Андан кийин жаңы фактылар кошулат. **Audit жазууну эсиңизде тут** (планоо-lifecycle скилл §5).

## 5. Эреже: `comment` милдеттүү — үч катмарда

`ActualExpense.comment` жана `Expense.comment` — **колдонуучу ачык текст жазууга тийиш**. Себеби: аудит тарыхында "эмне үчүн" деген жооп.

### Учурдагы жакшыртылышы керек нерсе (audit #10)

- Model: `comment = TextField(blank=False)` ✓
- Serializer: `CharField(required=True, allow_blank=False)` — текшер
- Service: `if not comment or not comment.strip(): raise ValidationError(...)` ✓

Бирок **түз `Model.objects.create(comment='')`** иштейт (`blank=False` `ModelForm`'го гана тийет). Defense-in-depth: `clean()`'ти да кошуу же `validators=[MinLengthValidator(1)]`.

## 6. Эреже: Категория автомат "Башка"'га түшпөйт

### Проблема (audit #9)

Азыр `ActualExpenseService._get_or_assign_category` (services.py:437-465) категория аты дал келбесе түз эле "Башка" категорияга коёт. Колдонуучу ал тандоону билбейт → миссклассификация.

### Эреже

Frontend колдонуучуга **ачык тизмеден** категория тандоону талап кылат:
- Категория боштук → 400 `{"category": ["Категорияны тандаңыз."]}`
- Эгер автомат "Башка"'га дал келсе — frontend колдонуучудан "Айкындап бериңиз: ал категориясы "Башка"бы?" деп суроосу керек

### Backend'ти оңдоо

```python
# ❌ Азыркы — силент auto-assign:
if not category:
    category, _ = ExpenseCategory.objects.get_or_create(name='Башка', ...)

# ✅ Туура — ачык катa:
if not category:
    raise ValidationError({'category': ['Категорияны тандаңыз.']})
```

Балким "Башка" категория тизмеде сакталат, бирок колдонуучу **өзү тандайт** — автомат эмес.

## 7. Эреже: `Expense.plan_item` FK — катуу (null=False)

`Expense` жазганда `plan_item` милдеттүү жана ошол PlanItem ошол `plan_period`'ка таандык болуусу керек:

```python
def clean(self):
    if self.plan_item and self.plan_period:
        if self.plan_item.plan_period_id != self.plan_period_id:
            raise ValidationError({
                'plan_item': 'plan_item must belong to plan_period.'
            })
```

Бул FK интеграл валидациясы — frontend'те көрсөтүлгөн таңдалган dropdown'дын туура экенин backend кайтарышы керек.

## 8. `finance_actual_expense` sync (`Expense` ↔ `ActualExpense`)

`Expense.finance_actual_expense` — `OneToOneField(ActualExpense, null=True)`. Бул эки башка моделди синхрондоо үчүн:
- `Expense` жаратылганда — кошумча `ActualExpense` да жаратылат (services логикасы)
- Экөө тең тарыхта болот; бирин өчүрсө — экинчисиндеги FK `null` болот (`on_delete=SET_NULL`)

Бул sync **атайын**. ⚠️ **VERIFY**: sync'ти так кайсы service иштетип, катача болсо кантип калыбына келтирилерин бул скилл текшерген жок — `services.py`'тин ичинде `ExpenseService.create` логикасын окуп, кийин бул бөлүмгө так процедура жазыш керек.

## 9. План vs Факт отчёту

Отчёт учурда `apps/reports/` ичинде. Сунушталган эрежелер:

- **Группалоо ачкычы**: `(project, period)` же `(fund_kind, period)`
- **План сумма**: `sum(PlanItem.amount WHERE plan_period.status != 'draft')` — submitted/approved/locked гана
- **Факт сумма**: `sum(Expense.amount ...)` же `sum(ActualExpense.amount ...)` — **бир булак гана**

⚠️ **VERIFY**: `apps/reports/` код'ду окуу керек. Бул скилл `Expense` ↔ `ActualExpense` sync'инен келип чыккан double-counting тобокелчилигин **теориялык** деп кабыл алат; reports'те ал учурда кантип иштетилгенин тастыктабайт. Reports код анализи болбогонча — реалдуу double-counting бар же жогу белгисиз.

**Эреже** (target state): отчёт эки моделдин бирин тандап, экинчисин эске албайт. Реализация болсо — бул бөлүм жаңыртылып, `VERIFY` алынат.

## 9a. Foreman `ActualExpense` көрүү эрежеси

`ActualExpensePermission.has_object_permission` (`permissions.py:84-88`) ичинде foreman read гана, жана **`finance_period.fund_kind == 'project'`** болсо гана. Башкача айтканда:

- `office` же `charity` fund_kind ActualExpense'тер foreman'га **көрүнбөйт**
- Бул ройду `_foreman_can_see_actual_expense` функциясы текшерет (`permissions.py:38-43`)

Эреже: **`Expense` listing'те** да foreman фильтр болуу керек — азыр `ExpensePermission` тек гана admin/director уруксат берет, бирок foreman мүмкүн `Expense`'ти PlanItem тетикке киришкенде көрөт. Бул ырааттуу болбошу мүмкүн.

⚠️ **VERIFY**: `Expense` foreman үчүн толугу менен көрүнгүс болобу, же `fund_kind='project'` шартында гана жеткиликтүүбү — бул суроо билинтип жазылган эмес. `apps/planning/api/views.py` ичиндеги `ExpenseViewSet.get_queryset` окуу керек.

## 9b. Rejected ProrabPlan менен байланышкан факттер

**Эреже (2026-04-23)**: План = эстимация, факт = реалдуулук. Факт план абалына **тийиштиги жок**.

### Принцип

- Факт кандай чыкса, ошондой жазылат — план approved/rejected/draft эмне болсо да
- Факт суммасы план суммасынан **ашып кетсе да кала берет**
- Rejected ProrabPlan'га шилтеме берген факт жазылат; тарых сакталат
- Админ фактты көрүп, "бул план reject болгон эле" деп байкайт — отчёттордо белги болот

### Коддо

```python
# apps/planning/models.py ActualExpense.clean()
# Plan статусу текшерилбейт — шексиз жазылат:
#   if self.prorab_plan and self.prorab_plan.status == 'rejected':
#       raise ValidationError(...)   # ❌ мындай КИЛБАҢЫЗ
```

### Отчёттордо

Report модулу rejected план fact'терин өзүнчө группалайт же "⚠️ Жараксыз планга тийиштүү" деген badge менен көрсөтөт. Бирок **суммадан чыгарбайт** — факт чыныгы чыгым.

### Эмне ЭКЕ ТИЙИШТИҮ

- План сумма vs Факт сумма — plan = "биз күткөн", fact = "чын болгон". Айырма ар дайым мүмкүн, блок эмес.
- `PlanPeriod.limit_amount` — эң жогорку ориентир, бирок блок эмес (planning-lifecycle §5)
- `PlanPeriod.status == 'locked'` — БУЛ БЛОК (§4). Локк башка нерсе — ай жабылды, жаңы факт жазуу ТЫЮ.

## 10. Testing checklist

- [ ] `amount = 0` PlanItem жаратуу → 400
- [ ] `amount = -1` ActualExpense → 400
- [ ] `spent_at` периоддон тышкары → 400 (ActualExpense жана Expense үчүн)
- [ ] `locked` PlanPeriod'ко Expense кошуу → 400
- [ ] `locked` PlanPeriod'ко ActualExpense кошуу → 400 (эгер finance_period аркылуу байланышкан болсо)
- [ ] `comment=''` ActualExpense → 400
- [ ] Frontend категория тандабаса → 400 `{"category": [...]}`
- [ ] `Expense.plan_item` `plan_period`'ко таандык эмес болсо → 400
- [ ] Admin бир `Expense` жаратканда `ActualExpense` да жаратылат (sync)
- [ ] Foreman `Expense` жарата албайт → 403

## 11. Милдеттүү оңдоолор (audit жыйынтыгы)

Бул скилл төмөнкүлөргө негиз (plan-fact link жагы):

| # | Эмне | Файл |
|---|---|---|
| 2 | `PlanItem.validate_amount` | `apps/planning/api/serializers.py` |
| 4 | `spent_at` period range text | `apps/planning/models.py` (ActualExpense.clean, Expense.clean) |
| 9 | Категория автомат "Башка" алынып салынсын | `apps/planning/services.py:437-465` |
| 10 | `comment` defense-in-depth (`MinLengthValidator`) | `apps/planning/models.py` |
| 13 | `PlanPeriod.limit_amount` `MinValueValidator(0)` | `apps/planning/models.py` |

Ар бир оңдоо кодцо "per plan-fact-linking §X" деп цитат менен кошулат.
