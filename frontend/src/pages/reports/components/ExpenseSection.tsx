import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ExpenseSummaryCard } from './ExpenseSummaryCard'
import { ExpensePlannedTable } from './ExpensePlannedTable'
import { ExpenseFactsTable } from './ExpenseFactsTable'
import { ExpensePlannedVsActualChart } from './charts/ExpensePlannedVsActualChart'
import { ExpenseDailyChart } from './charts/ExpenseDailyChart'
import { CreateBudgetLineForm } from '@/features/budget-line-create/CreateBudgetLineForm'
import { ActualExpense } from '@/entities/actual-expense/model'
import { Table } from '@/shared/ui/Table/Table'
import { formatKGS } from '@/shared/lib/utils'
import './Section.css'

interface ExpenseSectionProps {
  planned: {
    budgetPlan: {
      id: number
      period_month: string
      scope: string
      project_name: string | null
      status: string
    } | null
    lines: Array<{
      id: number
      plan: number
      category: number
      category_name: string
      amount_planned: string
      note: string
    }>
    total: number
  }
  actual: Array<{
    id: number
    finance_period: number
    finance_period_fund_kind: string
    finance_period_month: string
    category: number | null
    category_id: number | null
    category_name: string | null
    name: string
    amount: string
    spent_at: string
    comment: string
    created_by: number
    created_by_username: string
  }>
  actualTotal: number | null
  delta: number | null
  deltaPercent: number | null
  monthStatus: 'OPEN' | 'LOCKED' | null
  loading: {
    planned: boolean
    actual: boolean
  }
  expenseByCategory: Array<{
    category_id: number | null
    category_name: string
    planned: number
    actual: number
  }>
  expenseDailyTotals: Array<{
    date: string
    total: number
  }>
  expenseFacts: {
    items: ActualExpense[] | undefined
    loading: boolean
    error: unknown | null
  }
  showPlanned?: boolean
  showActual?: boolean
  /** When false, hides the “plan vs actual by category” chart only (summary + tables unchanged). */
  showCategoryPlannedVsActualChart?: boolean
  /** When false, skips the daily expense chart (avoids duplicate empty state vs facts table). */
  showDailyExpenseChart?: boolean
  /**
   * Minimal foreman layout: no section h2, tighter spacing, hide note column,
   * simpler summary (no delta %), optional comment column on facts.
   */
  foremanExpenseUi?: boolean
}

export function ExpenseSection({
  planned,
  actual: _actual,
  actualTotal,
  delta,
  deltaPercent,
  monthStatus: _monthStatus,
  loading,
  expenseByCategory,
  expenseDailyTotals,
  expenseFacts,
  showPlanned = true,
  showActual = true,
  showCategoryPlannedVsActualChart = true,
  showDailyExpenseChart = true,
  foremanExpenseUi = false,
}: ExpenseSectionProps) {
  const { t } = useTranslation('reports')
  const plannedByCategory = useMemo(
    () => Object.fromEntries(expenseByCategory.map((row) => [String(row.category_id ?? 'null'), row.planned])),
    [expenseByCategory]
  )
  const plannedByCategoryName = useMemo(
    () => Object.fromEntries(expenseByCategory.map((row) => [String(row.category_name).trim().toLowerCase(), row.planned])),
    [expenseByCategory]
  )
  const actualByCategoryColumns = [
    { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
    { key: 'planned_amount', label: t('expense.tables.actual.columns.plannedAmount') },
    { key: 'actual_amount', label: t('expense.tables.actual.columns.amount') },
    { key: 'difference', label: t('expense.tables.actual.columns.difference') },
  ]
  const actualByCategoryRows = useMemo(() => {
    const items = expenseFacts.items ?? []
    const grouped = new Map<string, { category_name: string; actual: number; planned: number }>()

    items.forEach((item) => {
      const categoryName = String(item.category_name ?? 'Uncategorized').trim() || 'Uncategorized'
      const categoryId = item.category_id ?? (typeof item.category === 'number' ? item.category : null)
      const normalizedName = categoryName.toLowerCase()
      const planned =
        plannedByCategory[String(categoryId ?? 'null')] ??
        plannedByCategoryName[normalizedName] ??
        0
      const amount = Number.parseFloat(item.amount) || 0

      const current = grouped.get(normalizedName)
      if (current) {
        current.actual += amount
      } else {
        grouped.set(normalizedName, { category_name: categoryName, actual: amount, planned })
      }
    })

    return Array.from(grouped.values())
      .sort((a, b) => b.actual - a.actual)
      .map((row) => ({
        category_name: row.category_name,
        planned_amount: row.planned,
        actual_amount: row.actual,
        difference: row.actual - row.planned,
      }))
  }, [expenseFacts.items, plannedByCategory, plannedByCategoryName])
  return (
    <div
      className={`report-section expense-section${foremanExpenseUi ? ' expense-section--foreman' : ''}`}
    >
      {!foremanExpenseUi && <h2>{t('expense.title')}</h2>}
      <ExpenseSummaryCard
        planned={planned.total}
        actual={actualTotal}
        delta={delta}
        deltaPercent={deltaPercent}
        showDeltaPercent={!foremanExpenseUi}
      />
      
      {showPlanned && showCategoryPlannedVsActualChart && (
        <ExpensePlannedVsActualChart data={expenseByCategory} />
      )}
      {showDailyExpenseChart && <ExpenseDailyChart data={expenseDailyTotals} />}

      <div className="tables-container">
        {showPlanned && (
          <div className="table-section">
            <h3>{t('expense.planned')}</h3>
            {planned.budgetPlan?.scope === 'OFFICE' && 
             planned.budgetPlan?.status === 'OPEN' && 
             planned.budgetPlan?.id && (
              <CreateBudgetLineForm planId={planned.budgetPlan.id} />
            )}
            <ExpensePlannedTable
              lines={planned.lines}
              budgetPlanStatus={planned.budgetPlan?.status}
              loading={loading.planned}
              showNoteColumn={!foremanExpenseUi}
            />
          </div>
        )}

        {showActual && (
          <div className="table-section">
            <h3>{t('expense.actual')}</h3>
            {actualByCategoryRows.length > 0 && (
              <div className="actual-summary-block">
                <h4 className="actual-subsection-title">{t('expense.tables.actual.summaryTitle')}</h4>
                <Table
                  columns={actualByCategoryColumns}
                  data={actualByCategoryRows}
                  renderCell={(column, value) => {
                    if (column === 'planned_amount') {
                      return <span className="actual-summary-num">{formatKGS(Number(value) || 0)}</span>
                    }
                    if (column === 'actual_amount') {
                      return <span className="actual-summary-num actual-summary-num--strong">{formatKGS(Number(value) || 0)}</span>
                    }
                    if (column === 'difference') {
                      const n = Number(value) || 0
                      const tone = n > 0 ? 'is-positive' : n < 0 ? 'is-negative' : 'is-neutral'
                      return <span className={`actual-summary-num actual-diff ${tone}`}>{formatKGS(n)}</span>
                    }
                    return value as React.ReactNode
                  }}
                />
              </div>
            )}
            <h4 className="actual-subsection-title actual-subsection-title--detail">
              {t('expense.tables.actual.detailsTitle')}
            </h4>
            <ExpenseFactsTable
              items={expenseFacts.items}
              loading={expenseFacts.loading}
              error={expenseFacts.error}
              commentColumn={foremanExpenseUi ? 'when-nonempty' : 'always'}
              plannedByCategory={plannedByCategory}
              plannedByCategoryName={plannedByCategoryName}
              showPlanComparison={foremanExpenseUi}
            />
          </div>
        )}
      </div>
    </div>
  )
}

