import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
  useListBudgetPlansQuery,
  useCreateBudgetPlanMutation,
  useListExpenseCategoriesQuery,
  useListBudgetLinesQuery,
  useBulkUpsertBudgetLinesMutation,
} from '@/shared/api/budgetingApi'
import { useMonthPeriodId } from '@/shared/hooks/useMonthPeriodId'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import { toast } from '@/shared/ui/Toast/toast'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { formatMonthLabel } from '@/shared/lib/formatMonthLabel'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import './PlanSetupPage.css'

type ScopeUI = 'OFFICE' | 'PROJECT' | 'CHARITY'

const ALL_SCOPES: ScopeUI[] = ['OFFICE', 'PROJECT', 'CHARITY']

const ALLOWED_SCOPES_BY_ROLE: Record<string, ScopeUI[]> = {
  admin: ALL_SCOPES,
  director: ALL_SCOPES,
  foreman: ['PROJECT'],
}

const DEFAULT_SCOPE_BY_ROLE: Record<string, ScopeUI> = {
  admin: 'OFFICE',
  director: 'OFFICE',
  foreman: 'PROJECT',
}

function scopeToApi(scope: ScopeUI): 'office' | 'project' | 'charity' {
  if (scope === 'OFFICE') return 'office'
  if (scope === 'CHARITY') return 'charity'
  return 'project'
}

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)

export default function PlanSetupPage() {
  const { t, i18n } = useTranslation('planSetup')
  const [searchParams, setSearchParams] = useSearchParams()
  const { role: userRole } = useAuth()

  const allowedScopes = (userRole && ALLOWED_SCOPES_BY_ROLE[userRole]) ?? ALL_SCOPES
  const defaultScope = (userRole && DEFAULT_SCOPE_BY_ROLE[userRole]) ?? 'OFFICE'

  // URL as single source of truth: derive month and scope
  const month = searchParams.get('month') || DEFAULT_MONTH()
  const scopeParamRaw = searchParams.get('scope') as ScopeUI | null
  const scope =
    scopeParamRaw && allowedScopes.includes(scopeParamRaw) ? scopeParamRaw : defaultScope

  const [plannedByCategory, setPlannedByCategory] = useState<
    Record<number, { amount: string; note: string }>
  >({})

  const lang = i18n.resolvedLanguage || i18n.language || 'ru'
  const monthLabel = formatMonthLabel(month, lang)

  const scopeLower = scopeToApi(scope)

  // Sanitize URL only when scope is missing or forbidden (fix scope only; do not set month)
  useEffect(() => {
    const scopeInvalid = !scopeParamRaw || !allowedScopes.includes(scopeParamRaw)
    if (scopeInvalid) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('scope', scope)
          return next
        },
        { replace: true }
      )
    }
  }, [scopeParamRaw, allowedScopes, scope, setSearchParams])

  const updateUrl = (m: string, s: ScopeUI) => {
    setSearchParams(
      (prev) => {
        const currentMonth = prev.get('month') || DEFAULT_MONTH()
        const currentScope = prev.get('scope')
        if (currentMonth === m && currentScope === s) return prev
        const next = new URLSearchParams(prev)
        next.set('month', m)
        next.set('scope', s)
        return next
      },
      { replace: true }
    )
  }

  const {
    periodId: monthPeriodId,
    isLoading: isLoadingPeriodId,
    monthPeriod,
  } = useMonthPeriodId(month)

  const listPlansParams = { month, scope }
  const {
    data: plansData,
    isLoading: isLoadingPlans,
    isFetching: isFetchingPlans,
    refetch: refetchPlans,
  } = useListBudgetPlansQuery(listPlansParams, {
    skip: !month || !scope,
    refetchOnMountOrArgChange: true,
  })

  const plans = plansData?.results ?? []
  const plan = plans.find((p) => p.scope === scope) ?? null

  const [createBudgetPlan, { isLoading: isCreatingPlan }] = useCreateBudgetPlanMutation()

  const { data: categoriesData } = useListExpenseCategoriesQuery({
    scope: scopeLower,
    is_active: true,
    kind: 'EXPENSE',
  })
  const allCategories = categoriesData?.results ?? []
  const leafCategories = allCategories
    .filter((c) => (c.children_count ?? 0) === 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  const { data: linesData, refetch: refetchLines } = useListBudgetLinesQuery(
    { plan: plan?.id },
    {
      skip: !plan?.id,
      refetchOnMountOrArgChange: true,
    }
  )
  const [bulkUpsertBudgetLines, { isLoading: isSaving }] = useBulkUpsertBudgetLinesMutation()

  const isLocked = monthPeriod?.status === 'LOCKED'

  // Clear form state when month or scope changes so we never show previous month's amounts
  useEffect(() => {
    setPlannedByCategory({})
  }, [month, scope])

  // Sync form state from loaded plan lines whenever plan or lines change
  useEffect(() => {
    if (!plan?.id) {
      setPlannedByCategory({})
      return
    }
    const lines = linesData?.results ?? []
    if (lines.length > 0) {
      const next: Record<number, { amount: string; note: string }> = {}
      lines.forEach((line) => {
        next[line.category] = {
          amount: line.amount_planned || '',
          note: line.note || '',
        }
      })
      setPlannedByCategory(next)
    } else {
      setPlannedByCategory({})
    }
  }, [plan?.id, linesData])

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextMonth = e.target.value || DEFAULT_MONTH()
    updateUrl(nextMonth, scope)
  }
  const handleScopeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextScope = (e.target.value as ScopeUI) || defaultScope
    updateUrl(month, nextScope)
  }

  const handleCreatePlan = () => {
    if (monthPeriodId == null) return
    createBudgetPlan({
      period: monthPeriodId,
      scope,
      project: null,
    })
      .unwrap()
      .then(() => refetchPlans())
      .catch(() => {})
  }

  const setAmount = (categoryId: number, value: string) => {
    setPlannedByCategory((prev) => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] ?? { amount: '', note: '' }), amount: value },
    }))
  }
  const setNote = (categoryId: number, value: string) => {
    setPlannedByCategory((prev) => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] ?? { amount: '', note: '' }), note: value },
    }))
  }

  const handleSave = async () => {
    if (!plan) return
    const items = leafCategories.map((cat) => ({
      category: cat.id,
      amount_planned: plannedByCategory[cat.id]?.amount?.trim() || '0',
      note: plannedByCategory[cat.id]?.note?.trim() ?? '',
    }))
    try {
      await bulkUpsertBudgetLines({ plan: plan.id, items }).unwrap()
      refetchLines()
      toast.success(t('saved'))
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  const totalPlanned = leafCategories.reduce((sum, cat) => {
    const a = plannedByCategory[cat.id]?.amount?.trim()
    const num = a ? parseFloat(a) : 0
    return sum + (Number.isFinite(num) ? num : 0)
  }, 0)

  if (isLoadingPeriodId) {
    return <div className="plan-setup-page loading">{t('loading')}</div>
  }

  if (month && !monthPeriodId && !isLoadingPeriodId) {
    return (
      <div className="plan-setup-page">
        <h2>{t('title')}</h2>
        <MonthGateBanner />
        <div className="plan-setup-error">
          {t('monthPeriodNotFound')}
        </div>
      </div>
    )
  }

  if (!plan && !isLoadingPlans && !isFetchingPlans && monthPeriodId != null) {
    return (
      <div className="plan-setup-page">
        <h2>{t('title')}</h2>
        <div className="plan-setup-filters">
          <label>
            {t('fields.month')}
            <input type="month" value={month} onChange={handleMonthChange} />
          </label>
          <label>
            {t('fields.scope')}
            <select value={scope} onChange={handleScopeChange}>
              {allowedScopes.map((s) => (
                <option key={s} value={s}>
                  {t(`scopeOptions.${s}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="plan-setup-context">
          {monthLabel} · {t(`scopeOptions.${scope}`)}
        </p>
        {isLocked && (
          <p className="plan-setup-message">
            {t('readOnlyLocked', { defaultValue: 'Month is locked — planning is read-only.' })}
          </p>
        )}
        <div className="plan-setup-actions">
          <Button onClick={handleCreatePlan} disabled={isCreatingPlan || isLocked}>
            {isCreatingPlan ? t('actions.creating') : t('actions.createPlan')}
          </Button>
        </div>
      </div>
    )
  }

  if (!plan) {
    return <div className="plan-setup-page loading">{t('loadingPlan')}</div>
  }

  const columns = [
    { key: 'category_name', label: t('table.category') },
    { key: 'amount', label: t('table.amountPlanned') },
    { key: 'note', label: t('table.note') },
  ]
  const tableData = leafCategories.map((cat) => ({
    category_name: cat.name,
    amount: (
      <input
        type="number"
        min={0}
        step="0.01"
        value={plannedByCategory[cat.id]?.amount ?? ''}
        onChange={(e) => setAmount(cat.id, e.target.value)}
        className="plan-setup-input"
        disabled={isLocked}
      />
    ),
    note: (
      <input
        type="text"
        value={plannedByCategory[cat.id]?.note ?? ''}
        onChange={(e) => setNote(cat.id, e.target.value)}
        className="plan-setup-input"
        placeholder={t('table.note')}
        disabled={isLocked}
      />
    ),
  }))

  return (
    <div className="plan-setup-page">
      <h2>{t('title')}</h2>
      <MonthGateBanner />
      {isLocked && (
        <p className="plan-setup-message">
          {t('readOnlyLocked', { defaultValue: 'Month is locked — planning is read-only.' })}
        </p>
      )}
      <div className="plan-setup-filters">
        <label>
          {t('fields.month')}
          <input type="month" value={month} onChange={handleMonthChange} />
        </label>
        <label>
          {t('fields.scope')}
          <select value={scope} onChange={handleScopeChange}>
            {allowedScopes.map((s) => (
              <option key={s} value={s}>
                {t(`scopeOptions.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="plan-setup-context">
        {monthLabel} · {t(`scopeOptions.${scope}`)}
      </p>
      <div className="plan-setup-total">
        <strong>{t('summary.totalPlanned')}</strong> {formatMoneyKGS(totalPlanned)}
      </div>
      {tableData.length > 0 ? (
        <Table columns={columns} data={tableData} />
      ) : (
        <p className="plan-setup-empty">{t('emptyCategories')}</p>
      )}
      <div className="plan-setup-actions">
        <Button onClick={handleSave} disabled={isSaving || !plan || isLocked}>
          {isSaving ? t('actions.saving') : t('actions.save')}
        </Button>
      </div>
    </div>
  )
}
