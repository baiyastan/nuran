export interface PlanPeriod {
  id: number
  project: number
  project_name: string
  period: string // YYYY-MM format
  status: 'draft' | 'submitted' | 'approved' | 'locked'
  submitted_at: string | null
  approved_at: string | null
  locked_at: string | null
  comments: string
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

