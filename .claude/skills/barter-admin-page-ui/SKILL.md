---
name: barter-admin-page-ui
description: UI/UX rules for the admin-only barter-car page in the nuran app (MVP scope). Use when building the car list, 'add car' modal, 'mark as sold' modal, minimal detail view, stock summary header (received/sold counts), or role-gating the route. Covers the role check (admin only — director/foreman get 403 and no sidebar item), the 4-tile KPI strip, filters (brand/year/status/date range), the sold-modal form, Kyrgyz copy for every label, and the mobile-card fallback. Triggers on 'build car inventory page', 'mark car sold dialog', 'show how many cars in stock', 'hide this route from director', 'barter cars sidebar item'.
type: ui
---

# Бартер-машина админ баракчасы (MVP)

## 0. Роль чектөө

**Админ гана.** Director, foreman 403 алат. Source of truth: `apps.users.models.User.ROLE_CHOICES` — `admin` / `director` / `foreman`.

### Бэкенд

```python
# apps/barter_cars/permissions.py
from rest_framework.permissions import BasePermission

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'admin'
        )
```

`BarterCarViewSet.permission_classes = [IsAuthenticated, IsAdmin]`

### Фронтенд

Sidebar'да "Машиналар" пункту `user.role === 'admin'` болсо гана көрүнөт:

```tsx
{user.role === 'admin' && (
  <NavLink to="/admin/barter-cars" icon={<CarIcon />}>Машиналар</NavLink>
)}
```

Route guard: `/admin/barter-cars` маршруту role гаттер ичинде болот. Role жок болсо `/403` (же дашбордго редирект).

## 1. Баракчанын структурасы

```
┌─ Header: "Бартер машиналар" ──────── [+ Жаңы машина] ─┐
├─ KPI strip (4 тайл) ───────────────────────────────────┤
│  Келди: 23   Сатылды: 15   Калды: 8   Маржа: -$12,400  │
├─ Фильтр сызыгы (Статус / Марка / Жыл / Дата) ─────────┤
├─ Таблица (десктоп) / Карталар (мобил) ────────────────┤
│  Марка | Жыл | Кабыл ал.баа | Статус | Сат.баа | ...  │
└────────────────────────────────────────────────────────┘
```

## 2. KPI тайлдар

`GET /api/v1/barter-cars/stats/` response'тен түздөн-түз окулат.

| Тайл | Маани | Түс |
|---|---|---|
| **Келди** | `received_total` | боз |
| **Сатылды** | `sold_total` | жашыл |
| **Калды** | `in_stock` | көк |
| **Маржа** | `margin` объектиси (валюта боюнча) | оң→жашыл, терс→кызыл |

**Маанилүү:** Маржа валюта боюнча **өзүнчө** көрсөтүлөт, бир чоң суммага бириктирилбейт:

```
USD: -$12,400
KGS: +340,000 сом
```

Фильтрлер колдонулганда KPI **фильтрге көз каранды болбойт** — дайыма толук тарых (жумшак өчүрүлгөн машиналар кирбейт, бирок бардык статустар кошулат).

## 3. Таблица тилкелери

| Тилке | Эскертүү | Мобилде |
|---|---|---|
| Марка / Модель | `Toyota Camry` | ✓ (чоң текст) |
| Жыл | | ✓ |
| Мам.номер | бош болсо `—` | жашырылат |
| Кабыл ал. күнү | `DD.MM.YYYY` | жашырылат |
| Кабыл ал. баа | `$12,000` же `850,000 с` (валютасы менен) | ✓ |
| Статус | Badge түс менен | ✓ |
| Сатылган баа | Статус=SOLD гана, башкача `—` | жашырылат |
| Маржа | Статус=SOLD гана, `-$1,200` же `+$500` (түс менен) | жашырылат |
| Actions | Меню: `Көрүү` / `Сатылды деп белгилөө` (RECEIVED гана) / `Түзөтүү` / `Өчүрүү` | меню |

Статус badge түстөрү:
- `RECEIVED` — боз (`bg-slate-100 text-slate-700`)
- `SOLD` — жашыл (`bg-green-100 text-green-700`)

MVP'де фото/thumbnail жок. Болочок: `LISTED` (көк), `RETURNED` (сары) статустары + фото тилке.

## 4. "Сатылды деп белгилөө" модалы

Форма талаалары:

| Поле | Тип | Милдеттүү | Default |
|---|---|---|---|
| Сатылган баа | Decimal input (2 орун) | ✓ | — |
| Валюта | KGS / USD toggle | ✓ | `agreed_currency` |
| Сатылган күн | date picker | ✓ | бүгүн |
| Кимге сатылды | text, 120 белги | ✓ | — |
| Телефон | text | — | — |
| Эскертүү | textarea | — | — |

Submit: `POST /api/v1/barter-cars/{id}/mark-sold/`.

Двойной клик коргоо: submit кнопкасы request учурунда disabled болот (`isSubmitting` флагы). Idempotency-Key механизми долбоордо азыр жок — керек болсо кийинчерээк кошула алат.

**Модалдын астындагы эскертме:**

> ⚠️ Эске алыңыз: бул акча бухгалтерияга же кассага автоматтык түрдө жазылбайт. Бул өзүнчө реестр.

Submit ийгиликтүү болсо:
- Модал жабылат
- Тизмеде сап кыска убактылык жашыл highlight менен жаңылат
- Toast: "Машина сатылды деп белгиленди"
- KPI strip кайра жүктөлөт

## 5. "Жаңы машина" модалы

MVP'де — **модал** (өзүнчө бет эмес). Талаалары көп эмес. Эки секцияга бөлүнөт:

### Секция 1: Машина маалыматы
- Марка, Модель, Жыл (row)
- Мам.номер, VIN, Түс (row, баары опционалдуу)
- Пробег (км) (опционалдуу)
- Техпаспорт бар (checkbox)
- Доверенность менен алындыбы (checkbox)

### Секция 2: Бартер маалыматы
- Кимден алынды (аты) + Телефон (row)
- Кабыл алынган баа + Валюта (KGS/USD) + Кабыл алынган күн (row)
- Квартира шилтемеси (`apartment_ref`, эркин текст — мис. "Проект Ала-Тоо, Блок Б, кв.42")
- Эскертүү (textarea)

Submit: `POST /api/v1/barter-cars/`. Ийгиликтүү болсо — модал жабылат, тизме жаңыланат, жаңы сап highlight менен көрүнөт.

## 6. Detail көрүү (MVP — минималдуу)

Тизмедеги "Көрүү" басканда — **right-side drawer** же **ыңгайлуу модал** ачылат (өзүнчө бет керек эмес). Ичинде:

- Машина маалыматы (баардык талаалар, read-only)
- Бартер маалыматы
- Статус боюнча action кнопкалар:
  - `RECEIVED`: `[Сатылды деп белгилөө]` `[Түзөтүү]` `[Өчүрүү]`
  - `SOLD`: тек гана `[Өчүрүү (архив)]`, башка өзгөртүү жок

MVP'де **tabs (Тарых / Сүрөттөр) жок**. Audit log'ту окуу — болочок этап (direct admin Django admin же `/api/v1/audit-logs/` аркылуу азырынча).

## 7. Түзөтүү (Edit)

"Түзөтүү" басканда ошол эле "Жаңы машина" модалы ачылат, бирок prefilled. Ошол эле форма, PATCH запрос:

- `RECEIVED` абалында бардык талаалар өзгөртүлөт (sold_* talaalar жок)
- `SOLD` абалында түзөтүү кнопкасы **жашырылат** (бэкенд PATCH'ты да 400 кайтарат)

## 8. Фильтр сызыгы

Горизонталдык, бардыгы URL param'га жазылат:

- **Статус** — multi-select (RECEIVED / SOLD)
- **Марка** — search-select (автокомплит, баары колдонулгандардан)
- **Жыл** — эки input (from/to)
- **Кабыл ал. күнү** — date range
- **Поиск** — марка/модель/мам.номер/VIN/received_from_name боюнча
- `[Тазалоо]` кнопкасы

## 9. Мобил

`md:` breakpoint'тен төмөн — таблица карта тизмесине айланат. Ар бир карта:

```
┌─────────────────────────────────┐
│ Toyota Camry, 2018               │
│ Кабыл: $12,000                   │
│ Статус: RECEIVED (badge)         │
│ [Сатылды] [⋯ меню]               │
└─────────────────────────────────┘
```

Фильтр сызыгы — "Фильтр" кнопкасына коллапс, басканда bottom sheet ачылат.

## 10. Кыргызча лейблдер (стандарт)

| EN | KY |
|---|---|
| Cars | Машиналар |
| Barter cars | Бартер машиналар |
| Received | Келди |
| Sold | Сатылды |
| In stock | Калды |
| Agreed value | Кабыл алынган баа |
| Sale price | Сатылган баа |
| Mark as sold | Сатылды деп белгилөө |
| Margin | Маржа |
| Apartment reference | Квартира шилтемеси |
| Buyer (received from) | Ким берди |
| Buyer (sold to) | Кимге сатылды |
| Has tech passport | Техпаспорт бар |
| By power of attorney | Доверенность менен |
| Mileage | Пробег |
| Plate number | Мам.номер |
| Notes | Эскертүү |
| New car | Жаңы машина |
| Edit | Түзөтүү |
| Delete / Archive | Өчүрүү |
| Save | Сактоо |
| Cancel | Жокко чыгаруу |

## 11. Empty / loading / error

- **Empty (бир да машина жок)**: чоң иконка + "Азыр бартер машиналары жок" + `[+ Жаңы машина]` кнопкасы
- **Loading**: skeleton rows (5 сап)
- **Error**: "Маалымат жүктөлгөн жок" + `[Кайра аракет]` кнопкасы
- **Filtered empty**: "Фильтр боюнча эч нерсе табылган жок" + `[Фильтрди тазалоо]`

## 12. Permissions reminder

Director жана foreman `/admin/barter-cars*` маршруттарын көрбөйт, sidebar'да пункт жок, API 403 кайтарат. Бул жолку жалгыз роль — `admin`.
