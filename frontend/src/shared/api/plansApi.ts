import { baseApi } from './baseApi'
import { Plan } from '@/entities/plan/model'

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

export const plansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPlans: builder.query<PlanListResponse, PlanListParams | void>({
      query: (params) => ({
        url: '/plans/',
        params,
      }),
      providesTags: ['Plan'],
    }),
    getPlan: builder.query<Plan, number>({
      query: (id) => ({ url: `/plans/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'Plan', id }],
    }),
    createPlan: builder.mutation<Plan, Partial<Plan>>({
      query: (body) => ({
        url: '/plans/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Plan'],
    }),
    updatePlan: builder.mutation<Plan, { id: number; data: Partial<Plan> }>({
      query: ({ id, data }) => ({
        url: `/plans/${id}/`,
        method: 'PATCH',
        data: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Plan', id }, 'Plan'],
    }),
    deletePlan: builder.mutation<void, number>({
      query: (id) => ({
        url: `/plans/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Plan'],
    }),
  }),
})

export const {
  useListPlansQuery,
  useGetPlanQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
} = plansApi

