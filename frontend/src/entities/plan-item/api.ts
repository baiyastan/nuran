import { api } from '@/shared/api/base'
import { PlanItem } from './model'

export interface PlanItemListParams {
  plan?: number
  status?: string
  approval_stage?: string
  created_by?: number
  material?: string
  date_from?: string
  date_to?: string
  cost_min?: number
  cost_max?: number
  search?: string
  ordering?: string
  page?: number
}

export interface PlanItemListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PlanItem[]
}

export const planItemApi = {
  list: async (params?: PlanItemListParams): Promise<PlanItemListResponse> => {
    const response = await api.get<PlanItemListResponse>('/plan-items/', { params })
    return response.data
  },
  
  get: async (id: number): Promise<PlanItem> => {
    const response = await api.get<PlanItem>(`/plan-items/${id}/`)
    return response.data
  },
  
  create: async (data: Partial<PlanItem>): Promise<PlanItem> => {
    const response = await api.post<PlanItem>('/plan-items/', data)
    return response.data
  },
  
  update: async (id: number, data: Partial<PlanItem>): Promise<PlanItem> => {
    const response = await api.patch<PlanItem>(`/plan-items/${id}/`, data)
    return response.data
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/plan-items/${id}/`)
  },
  
  approve: async (id: number): Promise<PlanItem> => {
    const response = await api.post<PlanItem>(`/plan-items/${id}/approve/`)
    return response.data
  },
}

