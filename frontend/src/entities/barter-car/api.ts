import { axiosInstance as api } from '@/shared/api/axiosInstance'
import {
  BarterCar,
  BarterCarCreateInput,
  BarterCarEditInput,
  BarterCarMarkSoldInput,
  BarterCarStats,
} from './model'

export interface BarterCarListParams {
  status?: 'RECEIVED' | 'SOLD'
  brand?: string
  agreed_currency?: 'KGS' | 'USD'
  search?: string
  ordering?: string
  include_archived?: 'true'
  page?: number
}

export interface BarterCarListResponse {
  count: number
  next: string | null
  previous: string | null
  results: BarterCar[]
}

export const barterCarApi = {
  list: async (params?: BarterCarListParams): Promise<BarterCarListResponse> => {
    const res = await api.get<BarterCarListResponse | BarterCar[]>('/barter-cars/', { params })
    if (Array.isArray(res.data)) {
      return { count: res.data.length, next: null, previous: null, results: res.data }
    }
    return res.data
  },

  get: async (id: number): Promise<BarterCar> => {
    const res = await api.get<BarterCar>(`/barter-cars/${id}/`)
    return res.data
  },

  create: async (data: BarterCarCreateInput): Promise<BarterCar> => {
    const res = await api.post<BarterCar>('/barter-cars/', data)
    return res.data
  },

  update: async (id: number, data: BarterCarEditInput): Promise<BarterCar> => {
    const res = await api.patch<BarterCar>(`/barter-cars/${id}/`, data)
    return res.data
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/barter-cars/${id}/`)
  },

  markSold: async (id: number, data: BarterCarMarkSoldInput): Promise<BarterCar> => {
    const res = await api.post<BarterCar>(`/barter-cars/${id}/mark-sold/`, data)
    return res.data
  },

  stats: async (): Promise<BarterCarStats> => {
    const res = await api.get<BarterCarStats>('/barter-cars/stats/')
    return res.data
  },
}
