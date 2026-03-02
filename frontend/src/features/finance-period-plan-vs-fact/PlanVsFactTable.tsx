import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useListPlanPeriodsQuery } from '@/shared/api/planPeriodsApi'
import { useListPlanItemsQuery } from '@/shared/api/planItemsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'
import { FinancePeriod } from '@/entities/finance-period/model'
import { Table } from '@/shared/ui/Table/Table'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import './PlanVsFactTable.css'

interface PlanVsFactTableProps {
  financePeriod: FinancePeriod
}

interface ComparisonRow {
  category: string
  plan: number
  fact: number
  diff: number
  percent: number
}

export function PlanVsFactTable({ financePeriod }: PlanVsFactTableProps) {
  const { t } = useTranslation()

  // Fetch plan period for this project and month
  const { data: planPeriodsData, isLoading: isLoadingPlanPeriods } = useListPlanPeriodsQuery({
    project: financePeriod.project || undefined,
    period: financePeriod.month_period_month,
  })

  // Extract plan period ID
  const planPeriods = useMemo(() => {
    if (!planPeriodsData) return []
    return Array.isArray(planPeriodsData) ? planPeriodsData : planPeriodsData.results || []
  }, [planPeriodsData])

  const planPeriod = planPeriods.length > 0 ? planPeriods[0] : null
  const planPeriodId = planPeriod?.id

  // Fetch plan items
  const { data: planItemsData, isLoading: isLoadingPlanItems } = useListPlanItemsQuery(
    planPeriodId ? { plan_period_id: planPeriodId } : undefined,
    { skip: !planPeriodId }
  )

  // Fetch actual expenses (API uses month + scope)
  const scope = financePeriod.fund_kind === 'office' ? 'OFFICE' : financePeriod.fund_kind === 'charity' ? 'CHARITY' : 'PROJECT'
  const { data: expensesData, isLoading: isLoadingExpenses } = useListActualExpensesQuery({
    month: financePeriod.month_period_month,
    scope,
  })

  // Extract plan items
  const planItems = useMemo(() => {
    if (!planItemsData) return []
    return Array.isArray(planItemsData) ? planItemsData : planItemsData.results || []
  }, [planItemsData])

  // Extract actual expenses
  const expenses = useMemo(() => {
    if (!expensesData) return []
    return Array.isArray(expensesData) ? expensesData : expensesData.results || []
  }, [expensesData])

  // Build planByCategory map: category name -> total plan amount
  const planByCategory = useMemo(() => {
    const map = new Map<string, { name: string; planAmount: number }>()
    
    planItems.forEach((item) => {
      const category = item.category || 'uncategorized'
      const amount = parseFloat(String(item.amount || '0')) || 0
      
      if (map.has(category)) {
        const existing = map.get(category)!
        existing.planAmount += amount
      } else {
        map.set(category, { name: category, planAmount: amount })
      }
    })
    
    return map
  }, [planItems])

  // Build factByCategory map: category_id or 'uncategorized' -> total fact amount
  const factByCategory = useMemo(() => {
    const map = new Map<string | number, { name: string; factAmount: number }>()
    
    expenses.forEach((expense) => {
      const categoryKey = expense.category_id || expense.category || 'uncategorized'
      const categoryName = expense.category_name || 'uncategorized'
      const amount = parseFloat(String(expense.amount || '0')) || 0
      
      if (map.has(categoryKey)) {
        const existing = map.get(categoryKey)!
        existing.factAmount += amount
      } else {
        map.set(categoryKey, { name: categoryName, factAmount: amount })
      }
    })
    
    return map
  }, [expenses])

  // Merge categories and build comparison rows
  const comparisonRows = useMemo(() => {
    const rows: ComparisonRow[] = []
    const categorySet = new Set<string>()
    
    // Collect all category names from plan
    planByCategory.forEach((value) => {
      categorySet.add(value.name)
    })
    
    // Collect all category names from fact
    factByCategory.forEach((value) => {
      categorySet.add(value.name)
    })
    
    // Build rows for each category
    categorySet.forEach((categoryName) => {
      // Find plan amount (key is category name in planByCategory)
      const planEntry = planByCategory.get(categoryName)
      const planAmount = planEntry?.planAmount || 0
      
      // Find fact amount (match by category name)
      let factAmount = 0
      factByCategory.forEach((value) => {
        if (value.name === categoryName) {
          factAmount = value.factAmount
        }
      })
      
      const diff = factAmount - planAmount
      const percent = planAmount > 0 ? (diff / planAmount) * 100 : 0
      
      rows.push({
        category: categoryName,
        plan: planAmount,
        fact: factAmount,
        diff,
        percent,
      })
    })
    
    // Sort by largest absolute diff descending
    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    
    return rows
  }, [planByCategory, factByCategory])

  // Calculate totals
  const totals = useMemo(() => {
    const totalPlan = comparisonRows.reduce((sum, row) => sum + row.plan, 0)
    const totalFact = comparisonRows.reduce((sum, row) => sum + row.fact, 0)
    const totalDiff = totalFact - totalPlan
    
    return { totalPlan, totalFact, totalDiff }
  }, [comparisonRows])

  const isLoading = isLoadingPlanPeriods || isLoadingPlanItems || isLoadingExpenses

  // Show empty state if no plan found
  if (!isLoading && !planPeriod) {
    return (
      <div className="plan-vs-fact-table">
        <div className="empty-state">
          <p>{t('financePeriods.planVsFact.noPlanFound')}</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="plan-vs-fact-table">
        <div className="loading">{t('common.loading')}</div>
      </div>
    )
  }

  const columns = [
    { key: 'category', label: t('financePeriods.planVsFact.columns.category') },
    { key: 'plan', label: t('financePeriods.planVsFact.columns.plan') },
    { key: 'fact', label: t('financePeriods.planVsFact.columns.fact') },
    { key: 'diff', label: t('financePeriods.planVsFact.columns.diff') },
    { key: 'percent', label: t('financePeriods.planVsFact.columns.percent') },
  ]

  const tableData = comparisonRows.map((row) => ({
    category: row.category,
    plan: formatMoneyKGS(row.plan),
    fact: formatMoneyKGS(row.fact),
    diff: (
      <span
        className={`diff-value ${row.diff < 0 ? 'diff-negative' : row.diff > 0 ? 'diff-positive' : ''}`}
      >
        {formatMoneyKGS(row.diff)}
      </span>
    ),
    percent: `${row.percent >= 0 ? '+' : ''}${row.percent.toFixed(1)}%`,
  }))

  return (
    <div className="plan-vs-fact-table">
      {/* Summary Cards */}
      <div className="plan-vs-fact-summary">
        <div className="fp-card">
          <div className="fp-card__label">{t('financePeriods.planVsFact.summary.totalPlan')}</div>
          <div className="fp-card__value">{formatMoneyKGS(totals.totalPlan)}</div>
        </div>
        <div className="fp-card">
          <div className="fp-card__label">{t('financePeriods.planVsFact.summary.totalFact')}</div>
          <div className="fp-card__value">{formatMoneyKGS(totals.totalFact)}</div>
        </div>
        <div className="fp-card">
          <div className="fp-card__label">{t('financePeriods.planVsFact.summary.diff')}</div>
          <div
            className={`fp-card__value ${totals.totalDiff < 0 ? 'diff-negative' : totals.totalDiff > 0 ? 'diff-positive' : ''}`}
          >
            {formatMoneyKGS(totals.totalDiff)}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      {comparisonRows.length === 0 ? (
        <div className="empty-state">
          <p>{t('financePeriods.planVsFact.noPlanFound')}</p>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

