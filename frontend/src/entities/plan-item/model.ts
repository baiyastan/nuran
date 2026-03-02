export interface PlanItem {
  id: number
  plan_period: number
  plan_period_period: string
  project_name: string
  title: string
  category: number | null
  category_name?: string | null
  qty: number
  unit: string
  amount: number
  note: string
  created_by: number
  created_by_username: string
  created_at: string
  /** Optional: approval workflow (if backend provides) */
  status?: string
  approval_stage?: string
  /** Optional: cost/date for display (if backend provides) */
  cost?: number
  date?: string
}
