---
name: barter-cars-entity
description: Barter-car inventory rules for the nuran app (Kyrgyzstan construction). Use when building the admin-only car inventory page, marking a car sold, tracking received/sold/remaining counts, or reconciling the agreed barter value vs. actual sale price. Covers the Car model fields, the minimal RECEIVED → SOLD lifecycle, why barter-value ≠ sale-price, Kyrgyz paperwork reality (техпаспорт, доверенность, blank VIN), and audit log integration using the existing AuditLog model. Triggers on 'add a car', 'mark car sold', 'how many cars in stock', 'edit a car's agreed value', 'why are received-value and sold-value different'.
type: domain
---

# Бартерге келген машиналар — entity

## 0. Эмне үчүн керек

Курулуш компаниясы квартира сатканда кээ бир сатып алуучулар акчанын ордуна машина берет. Компания бул машинаны кабыл алат, кийин сатып акчага айландырат. Бул модуль **кайсы машина келди, канчага кабыл алынды, сатылдыбы, канчага сатылды** дегенди гана көзөмөлдөйт.

Django app аты: `barter_cars` (жөн эле `cars` эмес — компаниянын иш машиналары кийин башка app'те болуусу керек, анткени алардын акчасы бюджетке тийет).

## 1. Долбоордун мурда бар конвенцияларына ылайык

- **Primary key** — default `BigAutoField` (integer). Долбоордо UUID колдонулбайт (мис. `apps.projects.Project`, `apps.audit.AuditLog.object_id = PositiveIntegerField`).
- **User role булагы** — `apps.users.models.User.ROLE_CHOICES` (`admin` / `director` / `foreman`). Копия кылбаңыз, `from apps.users.models import User` аркылуу окуңуз.
- **Audit log** — `apps.audit.models.AuditLog` (бар модель). Custom `write_audit` helper **жок** — түз `AuditLog.objects.create(...)` колдонуңуз.
- **Attachment модели жок** — MVP'де файл тиркөөлөр жок. "Фото жүктөө" болочок этапта (өзүнчө `attachments` app керек болот).

## 2. Car модели — talaalar (MVP)

| Поле | Тип | Милдеттүү | Эскертүү |
|---|---|---|---|
| `id` | BigAutoField (default) | ✓ | int PK |
| `brand` | CharField(60) | ✓ | Toyota, Mercedes, BMW... |
| `model` | CharField(60) | ✓ | Camry, E-class, X5 |
| `year` | PositiveSmallIntegerField | ✓ | 1980..current+1 |
| `plate_number` | CharField(20, blank=True) | — | Мам.номер |
| `vin` | CharField(32, blank=True) | — | Кыргыз рыногунда дайыма табылбайт |
| `color` | CharField(30, blank=True) | — | |
| `mileage_km` | PositiveIntegerField(null=True, blank=True) | — | |
| `has_tech_passport` | BooleanField(default=False) | ✓ | Техпаспорт барбы |
| `received_by_dover` | BooleanField(default=False) | ✓ | Доверенность менен алындыбы |
| `received_from_name` | CharField(120) | ✓ | Ким берди (покупатель аты) |
| `received_from_phone` | CharField(20, blank=True) | — | |
| `apartment_ref` | CharField(120, blank=True) | — | "Проект X, Блок Б, кв. 42" — эркин текст |
| `agreed_value` | DecimalField(14, 2) | ✓ | Бартерге кабыл алынган баа |
| `agreed_currency` | CharField(3, choices=[(KGS, KGS), (USD, USD)]) | ✓ | Көбү USD |
| `received_at` | DateField | ✓ | |
| `status` | CharField(20, choices=STATUS_CHOICES) | ✓ | `RECEIVED` / `SOLD` |
| `sold_price` | DecimalField(14, 2, null=True, blank=True) | статус=SOLD | |
| `sold_currency` | CharField(3, null=True, blank=True) | статус=SOLD | |
| `sold_to_name` | CharField(120, blank=True) | статус=SOLD | |
| `sold_to_phone` | CharField(20, blank=True) | — | |
| `sold_at` | DateField(null=True, blank=True) | статус=SOLD | |
| `notes` | TextField(blank=True) | — | |
| `is_active` | BooleanField(default=True) | ✓ | Soft delete flag |
| `created_at` | DateTimeField(auto_now_add=True) | ✓ | |
| `updated_at` | DateTimeField(auto_now=True) | ✓ | |
| `created_by` | FK User (SET_NULL) | — | |

## 3. Статус жашоо цикли (MVP)

```
RECEIVED ──► SOLD
```

- `RECEIVED` — машина келди, сатыла элек
- `SOLD` — сатылды; `sold_price`, `sold_currency`, `sold_to_name`, `sold_at` толтурулган

**Переход эрежелер:**
- `RECEIVED → SOLD` — `mark_sold` service аркылуу гана, түз PATCH менен эмес
- `SOLD → RECEIVED` — ТЫЮУ (сатуу жокко чыгарылса кол менен admin Django shell'де)
- `sold_*` талаалар PATCH менен түздөн-түз өзгөртүлбөйт — качан гана `mark_sold` service чакырылса

### Болочок (MVP'ге кирбейт)

- `LISTED` аралык статусу (сатууга коюлган, бирок сатыла элек)
- `RETURNED` финалдык статусу (ээсине кайтарылды)
- `linked_project` FK (`apps.projects.Project`'ке) — азыр `apartment_ref` эркин текст жетет

## 4. `agreed_value` ≠ `sold_price` — эмне үчүн

Бартерде машина **ашыкча бааланып** кабыл алынат (покупатель машинасын кымбат кылат, себеби ал квартиранын көбүрөөк бөлүгүнүн ордуна бергиси келет). Кийин реалдуу рынокто арзан кетет.

- `agreed_value` — квартиранын ордуна кабыл алынган "каталог" баасы
- `sold_price` — реалдуу түшкөн акча
- `margin = sold_price - agreed_value` — көбүнчө терс болот. Админ бул айырманы көрөт.

Reports'те `margin` өзүнчө тилкеде көрсөтүлөт, тарых боюнча кайсы бартер пайдалуу, кайсы зыян экени баамдалат.

## 5. Валюта эрежеси

- Бартер баалары көбүнчө **USD**
- Сатуу KGS же USD болушу мүмкүн
- **Автоматтык конвертация ЖАСАЛБАЙТ** — ар бир машина өзүнүн валютасында сакталат
- KPI тайлда суммалар **валюта боюнча өзүнчө** көрсөтүлөт: "USD: $X / KGS: Y сом"
- FX керек болсо — админ кол менен эсептейт. MVP'де FX rate service жок.

## 6. Audit log — долбоордун AuditLog моделин колдонуу

`apps.audit.models.AuditLog` фиксирленген схема: `action` ∈ {`create`, `update`, `delete`, `approve`, `lock`, `submit`}, `model_name`, `object_id` (int), `before` JSON, `after` JSON.

Бартер-машиналар үчүн:

| Учур | `action` | `before` | `after` |
|---|---|---|---|
| POST жаңы машина | `create` | `{}` | created fields snapshot |
| PATCH машина (agreed_value, notes, etc.) | `update` | prev values | new values |
| `mark_sold` service | `update` | `{status: 'RECEIVED', sold_price: null, ...}` | `{status: 'SOLD', sold_price: ..., sold_currency: ..., sold_at: ..., sold_to_name: ...}` |
| Soft delete (`is_active=False`) | `delete` | full snapshot | `{is_active: False}` |

Мисал:

```python
# apps/barter_cars/services.py
from apps.audit.models import AuditLog

def _snapshot(car):
    return {
        'status': car.status,
        'agreed_value': str(car.agreed_value),
        'agreed_currency': car.agreed_currency,
        'sold_price': str(car.sold_price) if car.sold_price is not None else None,
        'sold_currency': car.sold_currency,
        'sold_at': car.sold_at.isoformat() if car.sold_at else None,
        'sold_to_name': car.sold_to_name,
    }

def mark_sold(car, *, sold_price, sold_currency, sold_at, sold_to_name, sold_to_phone='', actor):
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

## 7. Редакциялоо (edit) саясаты

- Админ `agreed_value`, `agreed_currency`, `notes`, машина маалымат талааларын (brand/model/vin/plate/color/mileage) **`RECEIVED` абалында эркин өзгөртө алат** — ар бир өзгөрүш `AuditLog.action='update'` катары жазылат
- `SOLD` абалында PATCH **блоктолот** (HTTP 409 же 400). Баасы катача болсо — soft delete + жаңыдан жаратуу, же Django shell'де админ оңдойт (audit log тарых сакталат).
- `sold_*` талаалар PATCH'тен четке кагылат (`read_only` serializer'да) — `mark_sold` service'тен гана жазылат.

## 8. Жоюу (delete) саясаты

- Soft delete гана — `is_active=False`, физикалык `DELETE` жок
- List view `is_active=True` болгондорду гана кайтарат (default queryset)
- Admin керектесе — "архив" фильтри (`is_active=False`) кошула алат
- `AuditLog.action='delete'` жазылат, `before` — толук snapshot

## 9. Эмне ТЫЮУ САЛЫНАТ бул модулда

- Акча туюндуларын `finance`/`budgeting`/`actuals`/`expenses`/`planning` модулдарына жазуу — толук тыюу. `barter-money-isolation` скиллин көр.
- Квартира моделин бул жерде жаратуу — өзүнчө концепция (азыр жок), кошула турган болсо өзүнчө app.
- Валюта конвертация логикасын бул жерге жайгаштыруу — FX керек болсо `shared/currency` сыяктуу жалпы кызматка чыгаруу.

## 10. API endpoints (MVP — 5 гана)

```
GET    /api/v1/barter-cars/              # list
POST   /api/v1/barter-cars/              # create
GET    /api/v1/barter-cars/{id}/         # detail
PATCH  /api/v1/barter-cars/{id}/         # edit (RECEIVED гана; sold_* read-only)
DELETE /api/v1/barter-cars/{id}/         # soft delete (is_active=False)

POST   /api/v1/barter-cars/{id}/mark-sold/   # RECEIVED → SOLD

GET    /api/v1/barter-cars/stats/        # KPI
```

Бардыгы `IsAdmin` permission менен корголот (`request.user.role == 'admin'`).

### `GET /stats/` — response shape

```json
{
  "received_total": 23,
  "sold_total": 15,
  "in_stock": 8,
  "margin": {
    "USD": {"sold_count": 12, "agreed_sum": "145000.00", "sold_sum": "132600.00", "margin": "-12400.00"},
    "KGS": {"sold_count": 3, "agreed_sum": "2400000.00", "sold_sum": "2740000.00", "margin": "340000.00"}
  }
}
```

- `received_total` — is_active=True бардыгы
- `sold_total` — status=SOLD саны
- `in_stock` — status=RECEIVED саны
- `margin` — валюта боюнча обьект (KGS менен USD эки башка сакталат, бириктирилбейт)
- Бардык сандар string (Decimal → str сериализация)
