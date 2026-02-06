export interface Plan {
  id: number
  project: number
  project_name: string
  name: string
  description: string
  status: 'draft' | 'active' | 'completed'
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

