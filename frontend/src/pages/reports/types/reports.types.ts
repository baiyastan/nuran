// Reports Page Type Definitions

export type ReportTab = 'office' | 'project' | 'charity' | 'income'
export type IncomeScope = 'office' | 'project' | 'charity'

export interface ReportsPageState {
  // Global filters
  selectedMonth: string // "YYYY-MM" format
  selectedTab: ReportTab
  selectedProjectId: number | null // Only for Project tab
  
  // Resolved IDs
  financePeriodId: number | null // Resolved from month + fund_kind + project
  budgetPlanId: number | null // Resolved from month + scope + project
  
  // Month period status
  monthPeriodStatus: 'OPEN' | 'LOCKED' | null
  
  // Income Data (finance app)
  incomePlanned: {
    period: {
      year: number | null
      month: number | null
      status: string | null
    } | null
    summary: {
      total_amount: string
      items_count: number
    }
    items: Array<{
      id: number
      year: number
      month: number
      source: { id: number, name: string }
      amount: string
    }>
    total: number // Computed: sum of items.amount
  }
  
  incomeActual: Array<{
    id: number
    finance_period: number
    finance_period_fund_kind: string
    finance_period_month: string
    source?: { id: number, name: string } | null
    amount: string
    received_at: string
    comment: string
    created_by: number
    created_by_username: string
  }>
  incomeActualTotal: number // Computed: sum of incomeActual.amount
  incomeDelta: number // Computed: incomeActualTotal - incomePlanned.total
  incomeDeltaPercent: number | null // Computed: (incomeDelta / incomePlanned.total) * 100 (can be null when planned is 0 and actual > 0)
  
  // Expense Data (planning app)
  expensePlanned: {
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
    total: number // Computed: sum of lines.amount_planned
  }
  
  expenseActual: Array<{
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
  expenseActualTotal: number | null // Computed: sum of expenseActual.amount (null if FinancePeriod missing)
  expenseDelta: number | null // Computed: expenseActualTotal - expensePlanned.total (null if expenseActualTotal is null)
  expenseDeltaPercent: number | null // Computed: (expenseDelta / expensePlanned.total) * 100 (null if expenseActualTotal is null)
  
  // Aggregated data for charts
  incomeBySource: Array<{
    source_id: number
    source_name: string
    planned: number
    actual: number
  }>
  
  expenseByCategory: Array<{
    category_id: number | null
    category_name: string
    planned: number
    actual: number
  }>
  
  // Loading states
  loading: {
    financePeriod: boolean
    monthPeriod: boolean
    incomePlanned: boolean
    incomeActual: boolean
    expensePlanned: boolean
    expenseActual: boolean
  }
  
  // Error states
  errors: {
    financePeriod: string | null
    monthPeriod: string | null
    incomePlanned: string | null
    incomeActual: string | null
    expensePlanned: string | null
    expenseActual: string | null
  }
  
  // Warnings (non-blocking)
  warnings: {
    incomePlannedOfficeOnly: boolean // Show when viewing Project/Charity tabs
    noBudgetPlan: boolean // Show when BudgetPlan not found
    noFinancePeriod: boolean // Show when FinancePeriod not found
  }
}

