export interface Project {
  id: number
  name: string
  description: string
  status: 'active' | 'completed' | 'on_hold'
  created_by: number
  created_by_username: string
  prorab_id?: number
  assigned_prorab_id?: number
  created_at: string
  updated_at: string
}

