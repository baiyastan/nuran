import { api } from '@/shared/api/base'
import { Project } from './model'

export interface ProjectListParams {
  status?: string
  created_by?: number
  search?: string
  ordering?: string
  page?: number
}

export interface ProjectListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Project[]
}

export const projectApi = {
  list: async (params?: ProjectListParams): Promise<ProjectListResponse> => {
    const response = await api.get<ProjectListResponse>('/projects/', { params })
    return response.data
  },
  
  get: async (id: number): Promise<Project> => {
    const response = await api.get<Project>(`/projects/${id}/`)
    return response.data
  },
  
  create: async (data: Partial<Project>): Promise<Project> => {
    const response = await api.post<Project>('/projects/', data)
    return response.data
  },
  
  update: async (id: number, data: Partial<Project>): Promise<Project> => {
    const response = await api.patch<Project>(`/projects/${id}/`, data)
    return response.data
  },
  
  delete: async (id: number): Promise<void> => {
    await api.delete(`/projects/${id}/`)
  },
}

