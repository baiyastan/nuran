export interface Expense {
  id: number
  plan_period: number
  plan_period_period?: string
  plan_item: number
  plan_item_title?: string
  plan_item_amount?: string
  spent_at: string
  category: number | null
  category_name?: string | null
  amount: string
  comment: string
  created_by?: number
  created_by_username?: string
  created_at: string
  updated_at: string
}

