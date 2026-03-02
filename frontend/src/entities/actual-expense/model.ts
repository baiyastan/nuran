export interface ActualExpense {
  id: number
  month_period: number
  month_period_month?: string
  scope: 'OFFICE' | 'PROJECT' | 'CHARITY'
  category?: number | null
  category_id?: number | null
  category_name?: string | null
  amount: string
  spent_at: string
  comment: string
  created_by?: number
  created_by_username?: string
  created_at: string
  updated_at: string
}

export interface ProrabPlanSummary {
  plan_id: number
  planned_total: string
  spent_total: string
  remaining: string
}

export interface ProrabPlanExpense {
  id: number
  name: string
  amount: string
  spent_at: string
  created_at: string
}
