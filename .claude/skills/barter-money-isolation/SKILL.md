---
name: barter-money-isolation
description: Critical isolation rule for barter-car money in the nuran app. Use when anyone asks 'should the car sale hit the cash journal', when writing the sold endpoint, when building reports that aggregate project cash, or when adding a new finance/budgeting feature that might accidentally pull from barter_cars rows. Covers why car money is a separate ledger, forbidden imports (apps.finance → apps.barter_cars must NOT exist), the no-double-counting rule, the CI linter script, and the reporting split. Triggers on 'mark car sold', 'does this affect the budget', 'show total cash in', 'is car revenue project income', 'import barter_cars from finance'.
type: architecture
---

# Бартер-машина акчасы: изоляция эрежеси

## 0. ЭРЕЖЕ (бир сүйлөм)

Бартерге келген машина үчүн кирген же чыккан **бир да сом / доллар** `finance`, `budgeting`, `actuals`, `expenses`, `projects`, `planning`, `plans` модулдарына жазылбайт. Машина реестри — өзүнчө эсеп.

## 1. Эмне үчүн (бизнес мотивация)

1. **Машина акчасы расмий касса менен чогуу агылбайт** — сатуулар убактысы, формасы, документтери бүтүндөй башка процесс боюнча өтөт. Аларды автоматтык түрдө бир жерде кошуу = чаташтыруу.
2. **Квартира сатуу — башка модуль** — квартира акчасы өзүнчө учитывалат; машина анын "продукту" эмес, туундусу. Бартер машина сатуу долбоордун КАССА IN эмес.
3. **Plan/fact бузулбайт** — эгер машина сатуу долбоордун fact'ине кошулса, director/прораб планды туура эмес окуйт (долбоордун табышы жогоруу көрүнөт).
4. **Double counting алдын алуу** — бир эле акча эки жерде отчёттолсо, баардык финансы отчёттору ишенимсиз болот.

## 2. Код деңгээлдеги эрежелер

### 2.1 Импорт тыюулары

`apps/barter_cars/` ичинен БОЛБОЙТ:

```python
# ❌ ТЫЮУ САЛЫНГАН:
from apps.finance import ...
from apps.finance.models import ...
from apps.budgeting import ...
from apps.actuals import ...
from apps.expenses import ...
from apps.planning import ...
from apps.plans import ...
```

Бул эреже `scripts/check_barter_isolation.py` менен CI'да текшерилет. Бузулса — build түшөт.

### 2.2 `mark_sold` service — туура тандоо

```python
# apps/barter_cars/services.py
from django.core.exceptions import ValidationError
from apps.audit.models import AuditLog


def _snapshot(car):
    return {
        'status': car.status,
        'sold_price': str(car.sold_price) if car.sold_price is not None else None,
        'sold_currency': car.sold_currency,
        'sold_at': car.sold_at.isoformat() if car.sold_at else None,
        'sold_to_name': car.sold_to_name,
    }


def mark_sold(car, *, sold_price, sold_currency, sold_at, sold_to_name, sold_to_phone='', actor):
    # ❌ Мындай ЖАСАБА:
    # from apps.finance.models import CashEntry
    # CashEntry.objects.create(amount=sold_price, ...)
    #
    # from apps.actuals.models import ActualExpense
    # ActualExpense.objects.create(amount=-sold_price, type='income', ...)
    #
    # ✅ Туура: эч кандай тышкы модулга жазба. Бир гана car тапшырып,
    # AuditLog'ко update жазып кой.

    if car.status != 'RECEIVED':
        raise ValidationError('Only RECEIVED cars can be marked sold.')
    before = _snapshot(car)
    car.status = 'SOLD'
    car.sold_price = sold_price
    car.sold_currency = sold_currency
    car.sold_at = sold_at
    car.sold_to_name = sold_to_name
    car.sold_to_phone = sold_to_phone
    car.save()
    AuditLog.objects.create(
        actor=actor,
        action='update',
        model_name='BarterCar',
        object_id=car.id,
        before=before,
        after=_snapshot(car),
    )
    return car
```

### 2.3 Тескери тараптан тыюу

`apps/finance/`, `apps/budgeting/`, `apps/actuals/`, `apps/expenses/`, `apps/planning/`, `apps/plans/` ичинен БОЛБОЙТ:

```python
# ❌ ТЫЮУ САЛЫНГАН:
from apps.barter_cars import ...
```

Бул reports'те double counting'ти алдын алат. Эгер финансы отчёт машина реестрин көрсөтүшү керек болсо — өзүнчө admin dashboard'до, өзүнчө суроо менен.

## 3. Reports тарабынан — көрсөтүү эрежеси

| Отчёт | Машина акчасын көрсөтөбү? |
|---|---|
| Компаниянын жалпы касса калдыгы | ❌ Жок |
| Проект plan-vs-fact | ❌ Жок |
| Бюджет fact | ❌ Жок |
| Актуалдуу чыгымдар | ❌ Жок |
| Бартер машина отчёту (admin only) | ✅ Ооба — өзүнчө экранда |

Бартер отчёту — `GET /api/v1/barter-cars/stats/` аркылуу, `apps/barter_cars/` ичинде гана эсептелет.

## 4. "Кошолубу?" деген суроого жооп

Эгер кимдир бирөө (бухгалтер, директор, жаңы разработчик) "бул акчаны финансыга да кошолу" деп сураса:

**Жооп: жок, автоматтык түрдө эмес.**

Эгер бул акча башка эсепте керек болсо:
- Кол менен Excel'ге көчүрүлөт
- Башка системага кол менен киргизилет
- Автоматтык көпүрө түзүлбөйт

Кээде "кичинекей" интеграция эң чоң double-counting катаны алып келет — ал үчүн ушул чек.

## 5. CI линтер скрипти

Файл: `scripts/check_barter_isolation.py`

`pre-commit` hook'та жана CI пайплайнында иштейт:

```bash
python scripts/check_barter_isolation.py
# exit 0 — OK
# exit 1 — нарушение табылды, чыгарат кайсы файл, кайсы сап
```

Эки багытта текшерет:
- `apps/barter_cars/*.py` → `from apps.finance|budgeting|actuals|expenses|planning|plans` импорту
- `apps/finance|budgeting|actuals|expenses|planning|plans/*.py` → `from apps.barter_cars` импорту

Эки жак тең таза болууга тийиш. Migrations папкасы текшерилбейт.

## 6. Бул эреже качан өзгөрүшү мүмкүн?

Бартерди финансы менен интеграция кылууга жалгыз легит себеп: компания учёт процесстерин кайра курат жана бартерди расмий касса агымынын бир бөлүгү кылат. Ошол учурда бул скилл жаңыртылат (же жоюлат), жана эски маалыматтар үчүн миграция плану жазылат.

Азырынча: **изоляция кармалат**.
