export interface PlanPeriod {
  id: number
  fund_kind: 'project' | 'office' | 'charity'
  project: number | null
  project_name: string | null
  period: string // YYYY-MM format
  status: 'draft' | 'submitted' | 'approved' | 'locked'
  submitted_at: string | null
  approved_at: string | null
  locked_at: string | null
  comments: string
  limit_amount?: string | null
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

