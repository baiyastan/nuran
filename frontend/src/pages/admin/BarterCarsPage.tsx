import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Table } from '@/shared/ui/Table/Table'
import Loader from '@/shared/ui/Loader/Loader'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { barterCarApi } from '@/entities/barter-car/api'
import {
  BarterCar,
  BarterCarCreateInput,
  BarterCarMarkSoldInput,
  BarterCarStats,
  Currency,
} from '@/entities/barter-car/model'
import './BarterCarsPage.css'

type StatusFilter = '' | 'RECEIVED' | 'SOLD'

const today = (): string => new Date().toISOString().slice(0, 10)

function formatMoney(amount: string | null | undefined, currency: Currency | null | undefined): string {
  if (!amount || !currency) return '—'
  const n = Number(amount)
  if (Number.isNaN(n)) return '—'
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return currency === 'USD' ? `$${formatted}` : `${formatted} с`
}

function formatMargin(amount: string | null | undefined, currency: Currency | null | undefined): string {
  if (!amount || !currency) return '—'
  const n = Number(amount)
  if (Number.isNaN(n)) return '—'
  const sign = n > 0 ? '+' : ''
  const formatted = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const unit = currency === 'USD' ? `$${formatted}` : `${formatted} с`
  return n < 0 ? `-${unit}` : `${sign}${unit}`
}

export default function BarterCarsPage() {
  const { t } = useTranslation()
  const toast = useToastContext()

  const [cars, setCars] = useState<BarterCar[]>([])
  const [stats, setStats] = useState<BarterCarStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)

  const [createOpen, setCreateOpen] = useState(false)
  const [editCar, setEditCar] = useState<BarterCar | null>(null)
  const [sellCar, setSellCar] = useState<BarterCar | null>(null)
  const [confirmDeleteCar, setConfirmDeleteCar] = useState<BarterCar | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = { page: String(page) }
      if (statusFilter) params.status = statusFilter
      if (search) params.search = search
      const [listRes, statsRes] = await Promise.all([
        barterCarApi.list(params),
        barterCarApi.stats(),
      ])
      setCars(listRes.results)
      setTotalCount(listRes.count)
      setStats(statsRes)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Load failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search, page])

  useEffect(() => {
    load()
  }, [load])

  const columns = useMemo(
    () => [
      { key: 'brand_model', label: t('barterCars.table.brandModel') },
      { key: 'year', label: t('barterCars.table.year'), align: 'right' as const },
      { key: 'plate_number', label: t('barterCars.table.plate') },
      { key: 'received_at', label: t('barterCars.table.receivedAt') },
      { key: 'agreed', label: t('barterCars.table.agreedValue'), numeric: true, align: 'right' as const },
      { key: 'status', label: t('barterCars.table.status') },
      { key: 'sold_price', label: t('barterCars.table.soldPrice'), numeric: true, align: 'right' as const },
      { key: 'margin', label: t('barterCars.table.margin'), numeric: true, align: 'right' as const },
      { key: 'actions', label: t('common.actions'), align: 'right' as const },
    ],
    [t],
  )

  const rows = useMemo(
    () =>
      cars.map((c) => ({
        id: c.id,
        brand_model: `${c.brand} ${c.model}`,
        year: c.year,
        plate_number: c.plate_number || '—',
        received_at: c.received_at,
        agreed: formatMoney(c.agreed_value, c.agreed_currency),
        status: c.status,
        sold_price: c.status === 'SOLD' ? formatMoney(c.sold_price, c.sold_currency) : '—',
        margin: c.status === 'SOLD' ? formatMargin(c.margin, c.sold_currency) : '—',
        actions: c.id,
        _raw: c,
      })),
    [cars],
  )

  const renderCell = (column: string, value: unknown, row: Record<string, unknown>) => {
    const raw = row._raw as BarterCar
    if (column === 'status') {
      const cls = raw.status === 'SOLD' ? 'barter-badge barter-badge--sold' : 'barter-badge barter-badge--received'
      return <span className={cls}>{t(`barterCars.status.${raw.status}`)}</span>
    }
    if (column === 'margin') {
      const v = String(value ?? '—')
      const cls = v.startsWith('-') ? 'barter-margin barter-margin--neg' : v.startsWith('+') ? 'barter-margin barter-margin--pos' : ''
      return <span className={cls}>{v}</span>
    }
    if (column === 'actions') {
      return (
        <div className="barter-actions">
          {raw.status === 'RECEIVED' && (
            <>
              <Button size="small" onClick={() => setSellCar(raw)}>
                {t('barterCars.markSold')}
              </Button>
              <Button size="small" variant="secondary" onClick={() => setEditCar(raw)}>
                {t('common.edit')}
              </Button>
            </>
          )}
          <Button size="small" variant="danger" onClick={() => setConfirmDeleteCar(raw)}>
            {t('common.delete')}
          </Button>
        </div>
      )
    }
    return String(value ?? '—')
  }

  return (
    <div className="barter-page">
      <div className="barter-page__header">
        <h2>{t('pages.barterCars.title')}</h2>
        <Button onClick={() => setCreateOpen(true)}>+ {t('barterCars.newCar')}</Button>
      </div>

      <div className="barter-kpi">
        <KpiTile label={t('barterCars.kpi.received')} value={stats?.received_total ?? 0} tone="neutral" />
        <KpiTile label={t('barterCars.kpi.sold')} value={stats?.sold_total ?? 0} tone="success" />
        <KpiTile label={t('barterCars.kpi.inStock')} value={stats?.in_stock ?? 0} tone="info" />
        <KpiTileMargin label={t('barterCars.kpi.margin')} margin={stats?.margin} />
      </div>

      <div className="barter-filters">
        <Select
          aria-label={t('barterCars.table.status')}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1) }}
          options={[
            { value: '', label: t('barterCars.filters.allStatuses') },
            { value: 'RECEIVED', label: t('barterCars.status.RECEIVED') },
            { value: 'SOLD', label: t('barterCars.status.SOLD') },
          ]}
        />
        <Input
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {(statusFilter || search) && (
          <Button variant="secondary" size="small" onClick={() => { setStatusFilter(''); setSearch(''); setPage(1) }}>
            {t('barterCars.filters.clear')}
          </Button>
        )}
      </div>

      {loading && <Loader />}
      {error && <div className="barter-error">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <div className="barter-empty">{t('barterCars.empty')}</div>
      )}
      {!loading && !error && rows.length > 0 && (
        <>
          <Table columns={columns} data={rows} renderCell={renderCell} zebra />
          <Pagination page={page} total={totalCount} pageSize={20} onPageChange={setPage} />
        </>
      )}

      {createOpen && (
        <CarFormModal
          title={t('barterCars.newCar')}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (payload) => {
            try {
              await barterCarApi.create(payload)
              toast.showSuccess(t('barterCars.toast.created'))
              setCreateOpen(false)
              if (page === 1) await load(); else setPage(1)
            } catch (err) {
              toast.showError(extractError(err))
            }
          }}
        />
      )}

      {editCar && (
        <CarFormModal
          title={t('common.edit')}
          initial={editCar}
          onClose={() => setEditCar(null)}
          onSubmit={async (payload) => {
            try {
              await barterCarApi.update(editCar.id, payload)
              toast.showSuccess(t('barterCars.toast.updated'))
              setEditCar(null)
              await load()
            } catch (err) {
              toast.showError(extractError(err))
            }
          }}
        />
      )}

      {sellCar && (
        <MarkSoldModal
          car={sellCar}
          onClose={() => setSellCar(null)}
          onSubmit={async (payload) => {
            try {
              const updated = await barterCarApi.markSold(sellCar.id, payload)
              setCars(prev => prev.map(c => c.id === updated.id ? updated : c))
              toast.showSuccess(t('barterCars.toast.sold'))
              setSellCar(null)
              load()
            } catch (err) {
              toast.showError(extractError(err))
            }
          }}
        />
      )}

      {confirmDeleteCar && (
        <Modal isOpen onClose={() => setConfirmDeleteCar(null)} title={t('barterCars.confirmDelete.title')}>
          <p>{t('barterCars.confirmDelete.body', {
            brand: confirmDeleteCar.brand,
            model: confirmDeleteCar.model,
          })}</p>
          <div className="barter-modal__footer">
            <Button variant="secondary" onClick={() => setConfirmDeleteCar(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" onClick={async () => {
              try {
                await barterCarApi.delete(confirmDeleteCar.id)
                toast.showSuccess(t('barterCars.toast.deleted'))
                setConfirmDeleteCar(null)
                if (cars.length === 1 && page > 1) setPage(page - 1); else await load()
              } catch (err) {
                toast.showError(extractError(err))
              }
            }}>
              {t('common.delete')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Pagination({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number
  total: number
  pageSize: number
  onPageChange: (p: number) => void
}) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <div className="barter-pagination">
      <Button
        size="small"
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        {t('common.previous')}
      </Button>
      <span className="barter-pagination__info">
        {page} / {totalPages} ({total})
      </span>
      <Button
        size="small"
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        {t('common.next')}
      </Button>
    </div>
  )
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'success' | 'info' | 'warn' }) {
  return (
    <div className={`barter-kpi__tile barter-kpi__tile--${tone}`}>
      <div className="barter-kpi__label">{label}</div>
      <div className="barter-kpi__value">{value}</div>
    </div>
  )
}

function KpiTileMargin({ label, margin }: { label: string; margin: BarterCarStats['margin'] | undefined }) {
  const entries = margin ? Object.entries(margin) : []
  return (
    <div className="barter-kpi__tile barter-kpi__tile--margin">
      <div className="barter-kpi__label">{label}</div>
      {entries.length === 0 && <div className="barter-kpi__value">—</div>}
      {entries.map(([cur, m]) => {
        const cls = Number(m.margin) < 0 ? 'barter-margin--neg' : 'barter-margin--pos'
        return (
          <div key={cur} className={`barter-kpi__margin-row ${cls}`}>
            <span>{cur}:</span>
            <strong>{formatMargin(m.margin, cur as Currency)}</strong>
          </div>
        )
      })}
    </div>
  )
}

function extractError(err: unknown): string {
  const e = err as { response?: { data?: unknown }; message?: string }
  const data = e?.response?.data
  if (typeof data === 'string') return data
  if (data && typeof data === 'object') {
    const bag = data as Record<string, unknown>
    if (typeof bag.detail === 'string') return bag.detail
    const first = Object.values(bag)[0]
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0]
    if (typeof first === 'string') return first
  }
  return e?.message ?? 'Error'
}

type FormValues = BarterCarCreateInput

function CarFormModal({
  title,
  initial,
  onClose,
  onSubmit,
}: {
  title: string
  initial?: BarterCar
  onClose: () => void
  onSubmit: (payload: FormValues) => Promise<void>
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<FormValues>({
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    year: initial?.year ?? new Date().getFullYear(),
    plate_number: initial?.plate_number ?? '',
    vin: initial?.vin ?? '',
    color: initial?.color ?? '',
    mileage_km: initial?.mileage_km ?? null,
    has_tech_passport: initial?.has_tech_passport ?? false,
    received_by_dover: initial?.received_by_dover ?? false,
    received_from_name: initial?.received_from_name ?? '',
    received_from_phone: initial?.received_from_phone ?? '',
    apartment_ref: initial?.apartment_ref ?? '',
    agreed_value: initial?.agreed_value ?? '',
    agreed_currency: initial?.agreed_currency ?? 'USD',
    received_at: initial?.received_at ?? today(),
    notes: initial?.notes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)

  const update = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }))

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form
        className="barter-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setSubmitting(true)
          try {
            await onSubmit(values)
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <fieldset>
          <legend>{t('barterCars.form.carSection')}</legend>
          <div className="barter-form__row">
            <Input label={t('barterCars.form.brand')} required value={values.brand} onChange={(e) => update('brand', e.target.value)} />
            <Input label={t('barterCars.form.model')} required value={values.model} onChange={(e) => update('model', e.target.value)} />
            <Input label={t('barterCars.form.year')} type="number" required value={values.year} onChange={(e) => update('year', Number(e.target.value))} />
          </div>
          <div className="barter-form__row">
            <Input label={t('barterCars.form.plate')} value={values.plate_number ?? ''} onChange={(e) => update('plate_number', e.target.value)} />
            <Input label={t('barterCars.form.vin')} value={values.vin ?? ''} onChange={(e) => update('vin', e.target.value)} />
            <Input label={t('barterCars.form.color')} value={values.color ?? ''} onChange={(e) => update('color', e.target.value)} />
          </div>
          <div className="barter-form__row">
            <Input
              label={t('barterCars.form.mileage')}
              type="number"
              value={values.mileage_km ?? ''}
              onChange={(e) => update('mileage_km', e.target.value === '' ? null : Number(e.target.value))}
            />
            <label className="barter-form__check">
              <input type="checkbox" checked={values.has_tech_passport} onChange={(e) => update('has_tech_passport', e.target.checked)} />
              {t('barterCars.form.hasTechPassport')}
            </label>
            <label className="barter-form__check">
              <input type="checkbox" checked={values.received_by_dover} onChange={(e) => update('received_by_dover', e.target.checked)} />
              {t('barterCars.form.byDover')}
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>{t('barterCars.form.barterSection')}</legend>
          <div className="barter-form__row">
            <Input label={t('barterCars.form.receivedFromName')} required value={values.received_from_name} onChange={(e) => update('received_from_name', e.target.value)} />
            <Input label={t('barterCars.form.phone')} value={values.received_from_phone ?? ''} onChange={(e) => update('received_from_phone', e.target.value)} />
          </div>
          <div className="barter-form__row">
            <Input label={t('barterCars.form.agreedValue')} type="number" step="0.01" required value={values.agreed_value} onChange={(e) => update('agreed_value', e.target.value)} />
            <Select
              label={t('barterCars.form.currency')}
              value={values.agreed_currency}
              onChange={(e) => update('agreed_currency', e.target.value as Currency)}
              options={[{ value: 'USD', label: 'USD' }, { value: 'KGS', label: 'KGS' }]}
            />
            <Input label={t('barterCars.form.receivedAt')} type="date" required value={values.received_at} onChange={(e) => update('received_at', e.target.value)} />
          </div>
          <Input label={t('barterCars.form.apartmentRef')} value={values.apartment_ref ?? ''} onChange={(e) => update('apartment_ref', e.target.value)} />
          <label className="barter-form__textarea">
            <span>{t('barterCars.form.notes')}</span>
            <textarea rows={3} value={values.notes ?? ''} onChange={(e) => update('notes', e.target.value)} />
          </label>
        </fieldset>

        <div className="barter-modal__footer">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={submitting}>{submitting ? t('common.saving') : t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function MarkSoldModal({
  car,
  onClose,
  onSubmit,
}: {
  car: BarterCar
  onClose: () => void
  onSubmit: (payload: BarterCarMarkSoldInput) => Promise<void>
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<BarterCarMarkSoldInput>({
    sold_price: '',
    sold_currency: car.agreed_currency,
    sold_at: today(),
    sold_to_name: '',
    sold_to_phone: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)

  const update = <K extends keyof BarterCarMarkSoldInput>(k: K, v: BarterCarMarkSoldInput[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }))

  return (
    <Modal isOpen onClose={onClose} title={t('barterCars.markSoldDialog.title', { brand: car.brand, model: car.model })}>
      <form
        className="barter-form"
        onSubmit={async (e) => {
          e.preventDefault()
          setSubmitting(true)
          try {
            await onSubmit(values)
          } finally {
            setSubmitting(false)
          }
        }}
      >
        <div className="barter-form__row">
          <Input label={t('barterCars.form.soldPrice')} type="number" step="0.01" required value={values.sold_price} onChange={(e) => update('sold_price', e.target.value)} />
          <Select
            label={t('barterCars.form.currency')}
            value={values.sold_currency}
            onChange={(e) => update('sold_currency', e.target.value as Currency)}
            options={[{ value: 'USD', label: 'USD' }, { value: 'KGS', label: 'KGS' }]}
          />
          <Input label={t('barterCars.form.soldAt')} type="date" required value={values.sold_at} onChange={(e) => update('sold_at', e.target.value)} />
        </div>
        <div className="barter-form__row">
          <Input label={t('barterCars.form.soldToName')} required value={values.sold_to_name} onChange={(e) => update('sold_to_name', e.target.value)} />
          <Input label={t('barterCars.form.phone')} value={values.sold_to_phone ?? ''} onChange={(e) => update('sold_to_phone', e.target.value)} />
        </div>
        <label className="barter-form__textarea">
          <span>{t('barterCars.form.notes')}</span>
          <textarea rows={3} value={values.notes ?? ''} onChange={(e) => update('notes', e.target.value)} />
        </label>
        <p className="barter-warning">{t('barterCars.markSoldDialog.warning')}</p>
        <div className="barter-modal__footer">
          <Button type="button" variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={submitting}>{submitting ? t('common.saving') : t('barterCars.markSold')}</Button>
        </div>
      </form>
    </Modal>
  )
}
