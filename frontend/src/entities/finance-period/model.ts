export interface FinancePeriod {
  id: number
  month_period: number
  month_period_month: string
  fund_kind: 'project' | 'office' | 'charity'
  fund_kind_display: string
  project: number | null
  project_name: string | null
  income_total?: string
  status: 'open' | 'locked' | 'closed'
  status_display: string
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

export interface IncomeSummaryRow {
  source_id: number
  source_name: string
  planned: string
  actual: string
  diff: string
  plans_count: number
  entries_count: number
}

export interface IncomeSummaryResponse {
  rows: IncomeSummaryRow[]
  planned_total: string
  actual_total: string
  diff_total: string
}

