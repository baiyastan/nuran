import { baseApi } from './baseApi'
import { PlanItem } from '@/entities/plan-item/model'

export interface PlanItemListParams {
  status?: string
  project_id?: number
  plan_period_id?: number
  created_by?: number
  date_from?: string
  date_to?: string
  amount_min?: number
  amount_max?: number
  category?: string
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

export const planItemsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPlanItems: builder.query<PlanItemListResponse, PlanItemListParams | void>({
      query: (params) => ({
        url: '/plan-items/',
        params,
      }),
      providesTags: ['PlanItems'],
    }),
    createPlanItem: builder.mutation<PlanItem, Partial<PlanItem>>({
      query: (body) => ({
        url: '/plan-items/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['PlanItems', 'PlanPeriods'],
    }),
    deletePlanItem: builder.mutation<void, number>({
      query: (id) => ({
        url: `/plan-items/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['PlanItems', 'PlanPeriods'],
    }),
    approvePlanItem: builder.mutation<PlanItem, number>({
      query: (id) => ({
        url: `/plan-items/${id}/approve/`,
        method: 'POST',
      }),
      invalidatesTags: ['PlanItems', 'PlanPeriods'],
    }),
  }),
})

export const {
  useListPlanItemsQuery,
  useCreatePlanItemMutation,
  useDeletePlanItemMutation,
  useApprovePlanItemMutation,
} = planItemsApi
