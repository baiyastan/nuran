import { axiosInstance as api } from '@/shared/api/axiosInstance'
import { Plan } from './model'

export interface PlanListParams {
  project?: number
  status?: string
  created_by?: number
  search?: string
  ordering?: string
  page?: number
}

export interface PlanListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Plan[]
}

export const planApi = {
  list: async (params?: PlanListParams): Promise<PlanListResponse> => {
    const response = await api.get<PlanListResponse>('/plans/', { params })
    return response.data
  },
  
  get: async (id: number): Promise<Plan> => {
    const response = await api.get<Plan>(`/plans/${id}/`)
    return response.data
  },
  
  create: async (data: Partial<Plan>): Promise<Plan> => {
    const response = await api.post<Plan>('/plans/', data)
    return response.data
  },
  
  update: async (id: number, data: Partial<Plan>): Promise<Plan> => {
    const response = await api.patch<Plan>(`/plans/${id}/`, data)
    return response.data
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/plans/${id}/`)
  },
}

