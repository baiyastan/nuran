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
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { getErrorMessage, formatAmountInputDisplay, parseAmountInputInput } from '@/shared/lib/utils'
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

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

function decodeNote(note: string): { paymentDate: string; comment: string } {
  if (!note || !note.trim()) return { paymentDate: '', comment: '' }
  const lines = note.trim().split('\n')
  const first = lines[0].trim()
  if (DATE_ONLY_REGEX.test(first)) {
    return {
      paymentDate: first,
      comment: lines.slice(1).join('\n').trim(),
    }
  }
  return { paymentDate: '', comment: note.trim() }
}

function encodeNote(paymentDate: string, comment: string): string {
  const datePart = paymentDate.trim()
  const commentPart = comment.trim()
  if (datePart && commentPart) return datePart + '\n' + commentPart
  if (datePart) return datePart
  return commentPart
}

const CATEGORY_BADGE_COLORS = ['#e8f4ea', '#e8f0fe', '#fef7e0', '#fce8e6', '#f3e8f5']
function getCategoryBadgeColor(categoryId: number): string {
  return CATEGORY_BADGE_COLORS[Math.abs(categoryId) % CATEGORY_BADGE_COLORS.length]
}

function formatReadOnlyPlannedAmount(raw: string): string {
  const trimmed = raw?.trim() ?? ''
  if (!trimmed) return '—'
  const n = parseFloat(trimmed.replace(/\s/g, ''))
  if (!Number.isFinite(n)) return '—'
  return formatMoneyKGS(n)
}

export default function PlanSetupPage() {
  const { t, i18n } = useTranslation('planSetup')
  const [searchParams, setSearchParams] = useSearchParams()
  const { role: userRole } = useAuth()

  const isDirectorReadOnly = userRole === 'director'
  const canEditPlan = !isDirectorReadOnly

  const allowedScopes = (userRole && ALLOWED_SCOPES_BY_ROLE[userRole]) ?? ALL_SCOPES
  const defaultScope = (userRole && DEFAULT_SCOPE_BY_ROLE[userRole]) ?? 'OFFICE'

  // URL as single source of truth: derive month and scope
  const month = searchParams.get('month') || DEFAULT_MONTH()
  const scopeParamRaw = searchParams.get('scope') as ScopeUI | null
  const scope =
    scopeParamRaw && allowedScopes.includes(scopeParamRaw) ? scopeParamRaw : defaultScope

  const [plannedByCategory, setPlannedByCategory] = useState<
    Record<number, { amount: string; comment: string }>
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
  // Normalize API scope to UI scope for matching (backend returns OFFICE/PROJECT/CHARITY)
  const plan = plans.find((p) => (p.scope && String(p.scope).toUpperCase()) === scope) ?? null

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
      const next: Record<number, { amount: string; comment: string }> = {}
      lines.forEach((line) => {
        const { comment } = decodeNote(line.note || '')
        next[line.category] = {
          amount: line.amount_planned || '',
          comment,
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
      [categoryId]: { ...(prev[categoryId] ?? { amount: '', comment: '' }), amount: value },
    }))
  }
  const setComment = (categoryId: number, value: string) => {
    setPlannedByCategory((prev) => ({
      ...prev,
      [categoryId]: { ...(prev[categoryId] ?? { amount: '', comment: '' }), comment: value },
    }))
  }

  const handleSave = async () => {
    if (!plan) return
    const items = leafCategories.map((cat) => {
      const cell = plannedByCategory[cat.id]
      const note = encodeNote('', cell?.comment ?? '')
      return {
        category: cat.id,
        amount_planned: cell?.amount?.trim() || '0',
        note,
      }
    })
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
    return <LoadingScreen title={t('loading')} description="" />
  }

  if (month && !monthPeriodId && !isLoadingPeriodId) {
    return (
      <div className="plan-setup-page">
        <h2>{t('title')}</h2>
        {!isDirectorReadOnly && <MonthGateBanner />}
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
        <div className="plan-setup-no-plan-message">
          <p>{t('emptyStateNoPlanLine1')}</p>
          <p>
            {isDirectorReadOnly ? t('emptyStateNoPlanDirector') : t('emptyStateNoPlanLine2')}
          </p>
        </div>
        {canEditPlan && (
          <div className="plan-setup-actions">
            <Button onClick={handleCreatePlan} disabled={isCreatingPlan || isLocked}>
              {isCreatingPlan ? t('actions.creating') : t('actions.createPlan')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  if (!plan) {
    return <LoadingScreen title={t('loadingPlan')} description="" />
  }

  const columns = [
    { key: 'category_name', label: t('table.category') },
    { key: 'amount', label: t('table.amountPlanned') },
    { key: 'comment', label: t('table.comment') },
  ]
  const tableData = leafCategories.map((cat) => {
    const cell = plannedByCategory[cat.id]
    const rawAmount = cell?.amount ?? ''
    const backgroundColor = getCategoryBadgeColor(cat.id)
    return {
      category_name: (
        <span className="plan-setup-category-badge" style={{ backgroundColor }}>
          {cat.name}
        </span>
      ),
      amount: isDirectorReadOnly ? (
        <span className="plan-setup-readonly plan-setup-readonly--amount">
          {formatReadOnlyPlannedAmount(rawAmount)}
        </span>
      ) : (
        <input
          type="text"
          inputMode="decimal"
          value={formatAmountInputDisplay(rawAmount)}
          onChange={(e) => setAmount(cat.id, parseAmountInputInput(e.target.value))}
          onBlur={(e) => {
            const raw = parseAmountInputInput(e.target.value)
            if (raw !== rawAmount) setAmount(cat.id, raw)
          }}
          className="plan-setup-input plan-setup-input-amount"
          placeholder="0"
          disabled={isLocked}
        />
      ),
      comment: isDirectorReadOnly ? (
        <span className="plan-setup-readonly plan-setup-readonly--comment">
          {(cell?.comment ?? '').trim() ? (cell?.comment ?? '') : '—'}
        </span>
      ) : (
        <input
          type="text"
          value={cell?.comment ?? ''}
          onChange={(e) => setComment(cat.id, e.target.value)}
          className="plan-setup-input plan-setup-input-comment"
          placeholder={t('table.comment')}
          disabled={isLocked}
        />
      ),
    }
  })

  return (
    <div className="plan-setup-page">
      <h2>{t('title')}</h2>
      {!isDirectorReadOnly && <MonthGateBanner />}
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
      {canEditPlan && (
        <div className="plan-setup-actions">
          <Button
            className="plan-setup-save-btn"
            onClick={handleSave}
            disabled={isSaving || !plan || isLocked}
          >
            {isSaving ? t('actions.saving') : t('actions.savePlan')}
          </Button>
        </div>
      )}
    </div>
  )
}
