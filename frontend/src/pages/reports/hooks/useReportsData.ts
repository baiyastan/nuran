import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useListFinancePeriodsQuery, FinancePeriodListParams } from '@/shared/api/financePeriodsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useGetIncomePlansSummaryQuery } from '@/shared/api/incomePlansApi'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import { useGetMonthlyReportQuery } from '@/shared/api/reportsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'
import { ReportTab } from '../types/reports.types'

interface UseReportsDataParams {
  selectedMonth: string // YYYY-MM
  selectedTab: ReportTab
  selectedProjectId: number | null
}

export function useReportsData({
  selectedMonth,
  selectedTab,
  selectedProjectId,
}: UseReportsDataParams) {
  const { t } = useTranslation('reports')

  // Parse month to year and month
  const [year, month] = useMemo(() => {
    const parts = selectedMonth.split('-')
    return [parseInt(parts[0], 10), parseInt(parts[1], 10)]
  }, [selectedMonth])

  const isExpenseTab =
    selectedTab === 'office' || selectedTab === 'project' || selectedTab === 'charity'
  const isIncomeTab = selectedTab === 'income'

  // Expense tabs: scope drives API. Income: global, use fixed fund_kind for backend.
  const fundKind = useMemo(() => {
    if (selectedTab === 'income') return 'office' as const
    return selectedTab
  }, [selectedTab])

  const scope = useMemo(() => {
    if (selectedTab === 'office') return 'OFFICE'
    if (selectedTab === 'project') return 'PROJECT'
    if (selectedTab === 'charity') return 'CHARITY'
    return null
  }, [selectedTab])

  // Step 1: Fetch MonthPeriod status
  const { data: monthPeriod, isLoading: loadingMonthPeriod } = useGetMonthPeriodQuery(selectedMonth)

  // Step 2: Resolve FinancePeriod
  const financePeriodParams = useMemo((): FinancePeriodListParams => {
    const params: FinancePeriodListParams = {
      month: selectedMonth,
      fund_kind: fundKind,
    }
    if (fundKind === 'project' && selectedProjectId) {
      params.project = selectedProjectId
    }
    return params
  }, [selectedMonth, fundKind, selectedProjectId])

  const {
    data: financePeriodsData,
    isLoading: loadingFinancePeriod,
    error: financePeriodError,
  } = useListFinancePeriodsQuery(financePeriodParams, { skip: !isIncomeTab })

  const financePeriodId = useMemo(() => {
    if (financePeriodsData?.results && financePeriodsData.results.length > 0) {
      return financePeriodsData.results[0].id
    }
    return null
  }, [financePeriodsData])

  // Step 3: Fetch Income Planned (only on income tab)
  const {
    data: incomePlannedData,
    isLoading: loadingIncomePlanned,
    error: incomePlannedError,
  } = useGetIncomePlansSummaryQuery({ year, month }, { skip: !isIncomeTab })

  // Step 4: Fetch Income Actual (only on income tab, when we have a period)
  const {
    data: incomeActualData,
    isLoading: loadingIncomeActual,
    error: incomeActualError,
  } = useListIncomeEntriesQuery(
    financePeriodId ? { finance_period: financePeriodId } : undefined,
    { skip: !isIncomeTab || !financePeriodId }
  )

  // Step 5: Expense monthly report (only on expense tabs: office / project / charity)
  const monthlyReportParams: { month: string; scope: 'OFFICE' | 'PROJECT' | 'CHARITY' } = scope
    ? { month: selectedMonth, scope }
    : { month: selectedMonth, scope: 'OFFICE' }
  const {
    data: monthlyReportData,
    isLoading: loadingMonthlyReport,
    error: monthlyReportError,
  } = useGetMonthlyReportQuery(monthlyReportParams, {
    skip: !isExpenseTab || !scope,
  })

  // Step 6: Actual expenses list (facts) by month + scope for expense tabs
  const {
    data: expenseFactsData,
    isLoading: loadingExpenseFacts,
    error: expenseFactsError,
  } = useListActualExpensesQuery(
    scope ? { month: selectedMonth, scope } : undefined,
    { skip: !isExpenseTab || !scope }
  )

  const budgetPlanId = useMemo(() => monthlyReportData?.plan_id ?? null, [monthlyReportData])

  // Compute aggregated data
  const incomeBySource = useMemo(() => {
    const sourceMap = new Map<number, { source_id: number; source_name: string; planned: number; actual: number }>()

    // Add planned amounts
    if (incomePlannedData?.results) {
      incomePlannedData.results.forEach((plan) => {
        const sourceId = plan.source.id
        if (!sourceMap.has(sourceId)) {
          sourceMap.set(sourceId, {
            source_id: sourceId,
            source_name: plan.source.name,
            planned: parseFloat(plan.amount),
            actual: 0,
          })
        } else {
          const existing = sourceMap.get(sourceId)!
          existing.planned += parseFloat(plan.amount)
        }
      })
    }

    // Add actual amounts
    if (incomeActualData?.results) {
      incomeActualData.results.forEach((entry) => {
        if (entry.source) {
          const sourceId = entry.source.id
          if (!sourceMap.has(sourceId)) {
            sourceMap.set(sourceId, {
              source_id: sourceId,
              source_name: entry.source.name,
              planned: 0,
              actual: parseFloat(entry.amount),
            })
          } else {
            const existing = sourceMap.get(sourceId)!
            existing.actual += parseFloat(entry.amount)
          }
        }
      })
    }

    return Array.from(sourceMap.values())
  }, [incomePlannedData, incomeActualData])

  const expenseByCategory = useMemo(() => {
    if (scope && monthlyReportData) {
      const rows = monthlyReportData.rows.map((r) => ({
        category_id: r.category_id,
        category_name: r.category_name || '',
        planned: r.planned,
        actual: r.actual,
      }))
      if (monthlyReportData.uncategorized.actual > 0 || monthlyReportData.uncategorized.planned > 0) {
        rows.push({
          category_id: null,
          category_name: t('expense.tables.actual.uncategorized'),
          planned: monthlyReportData.uncategorized.planned,
          actual: monthlyReportData.uncategorized.actual,
        })
      }
      return rows
    }
    return []
  }, [scope, monthlyReportData, t])

  // Compute totals
  const incomePlannedTotal = useMemo(() => {
    if (!incomePlannedData?.results) return 0
    return incomePlannedData.results.reduce((sum, plan) => sum + parseFloat(plan.amount), 0)
  }, [incomePlannedData])

  const incomeActualTotal = useMemo(() => {
    if (!incomeActualData?.results) return 0
    return incomeActualData.results.reduce((sum, entry) => sum + parseFloat(entry.amount), 0)
  }, [incomeActualData])

  const expensePlannedTotal = useMemo(() => {
    if (scope && monthlyReportData) return monthlyReportData.totals.planned
    return 0
  }, [scope, monthlyReportData])

  const expenseActualTotal = useMemo(() => {
    if (!scope) return null
    if (monthlyReportData) return monthlyReportData.totals.actual
    return 0
  }, [scope, monthlyReportData])

  const incomeDelta = incomeActualTotal - incomePlannedTotal
  const incomeDeltaPercent =
    incomePlannedTotal === 0
      ? incomeActualTotal === 0
        ? 0
        : null
      : ((incomeActualTotal - incomePlannedTotal) / incomePlannedTotal) * 100

  const expenseDelta = expenseActualTotal !== null ? expenseActualTotal - expensePlannedTotal : null
  const expenseDeltaPercent =
    expenseActualTotal === null
      ? null
      : expensePlannedTotal === 0
      ? expenseActualTotal === 0
        ? 0
        : null
      : ((expenseActualTotal - expensePlannedTotal) / expensePlannedTotal) * 100

  // Compute daily totals for income (group by received_at day)
  const incomeDailyTotals = useMemo(() => {
    const dayMap = new Map<string, number>()
    if (incomeActualData?.results) {
      incomeActualData.results.forEach((entry) => {
        const date = new Date(entry.received_at)
        const dayKey = date.toISOString().split('T')[0] // YYYY-MM-DD
        const current = dayMap.get(dayKey) || 0
        dayMap.set(dayKey, current + parseFloat(entry.amount))
      })
    }
    return Array.from(dayMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [incomeActualData])

  // Compute daily totals for expenses: not available when using monthly report only (foreman path)
  const expenseDailyTotals = useMemo(() => [], [])

  return {
    // Resolved IDs
    financePeriodId,
    budgetPlanId,
    monthPeriodStatus: monthPeriod?.status || null,

    // Income data
    incomePlanned: {
      period: incomePlannedData?.period || null,
      summary: incomePlannedData?.summary || { total_amount: '0.00', items_count: 0 },
      items: incomePlannedData?.results || [],
      total: incomePlannedTotal,
    },
    incomeActual: incomeActualData?.results || [],
    incomeActualTotal,
    incomeDelta,
    incomeDeltaPercent,
    incomeBySource,

    // Expense data (from monthly report only - works for foreman read-only)
    expensePlanned: {
      budgetPlan: scope && monthlyReportData?.plan_id
        ? { id: monthlyReportData.plan_id, period_month: selectedMonth, scope, project_name: null, status: '' }
        : null,
      lines: scope && monthlyReportData
        ? monthlyReportData.rows.map((r, i) => ({
            id: i,
            plan: monthlyReportData.plan_id ?? 0,
            category: r.category_id ?? 0,
            category_name: r.category_name,
            amount_planned: String(r.planned),
            note: '',
          }))
        : [],
      total: expensePlannedTotal,
    },
    expenseActual: [], // Per-expense list not used when data comes from monthly report
    expenseActualTotal,
    expenseDelta,
    expenseDeltaPercent,
    expenseByCategory,
    incomeDailyTotals,
    expenseDailyTotals,

    // Expense facts list (per-expense records)
    expenseFacts: {
      items: expenseFactsData?.results ?? [],
      loading: loadingExpenseFacts,
      error: expenseFactsError ?? null,
    },

    // Loading states
    loading: {
      financePeriod: loadingFinancePeriod,
      monthPeriod: loadingMonthPeriod,
      incomePlanned: loadingIncomePlanned,
      incomeActual: loadingIncomeActual,
      expensePlanned: loadingMonthlyReport,
      expenseActual: loadingMonthlyReport,
    },

    // Error states
    errors: {
      financePeriod: financePeriodError ? t('errors.loadFinancePeriod') : null,
      monthPeriod: null,
      incomePlanned: incomePlannedError ? t('errors.loadIncomePlans') : null,
      incomeActual: incomeActualError ? t('errors.loadIncomeEntries') : null,
      expensePlanned: monthlyReportError ? t('errors.loadReport') : null,
      expenseActual: monthlyReportError ? t('errors.loadReport') : null,
    },

    // Warnings
    warnings: {
      incomePlannedOfficeOnly: false,
      noBudgetPlan: isExpenseTab && !budgetPlanId && scope !== null,
      noFinancePeriod: isIncomeTab && !financePeriodId,
    },
  }
}

