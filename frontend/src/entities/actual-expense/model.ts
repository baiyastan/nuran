export interface ActualExpense {
  id: number
  project: number
  project_name: string
  period?: number
  period_period?: string
  prorab_plan?: number
  prorab_plan_id?: number
  prorab_plan_item?: number
  prorab_plan_item_id?: number
  category?: number
  category_id?: number
  category_name?: string
  name: string
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

