import { baseApi } from './baseApi'
import { PlanPeriod } from '@/entities/plan-period/model'

export interface PlanPeriodListParams {
  project?: number
  status?: string
  period?: string
  search?: string
  ordering?: string
  page?: number
}

export interface PlanPeriodListResponse {
  count: number
  next: string | null
  previous: string | null
  results: PlanPeriod[]
}

export const planPeriodsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listPlanPeriods: builder.query<PlanPeriodListResponse, PlanPeriodListParams | void>({
      query: (params) => ({
        url: '/plan-periods/',
        params,
      }),
      providesTags: ['PlanPeriods'],
    }),
    getPlanPeriod: builder.query<PlanPeriod, number>({
      query: (id) => ({ url: `/plan-periods/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'PlanPeriods', id }],
    }),
    createPlanPeriod: builder.mutation<PlanPeriod, Partial<PlanPeriod>>({
      query: (body) => ({
        url: '/plan-periods/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['PlanPeriods'],
    }),
    submitPlanPeriod: builder.mutation<PlanPeriod, number>({
      query: (id) => ({
        url: `/plan-periods/${id}/submit/`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PlanPeriods', id }, 'PlanPeriods'],
    }),
    approvePlanPeriod: builder.mutation<PlanPeriod, { id: number; comments?: string }>({
      query: ({ id, comments }) => ({
        url: `/plan-periods/${id}/approve/`,
        method: 'POST',
        data: comments ? { comments } : {},
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'PlanPeriods', id }, 'PlanPeriods'],
    }),
    lockPlanPeriod: builder.mutation<PlanPeriod, number>({
      query: (id) => ({
        url: `/plan-periods/${id}/lock/`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PlanPeriods', id }, 'PlanPeriods'],
    }),
    unlockPlanPeriod: builder.mutation<PlanPeriod, number>({
      query: (id) => ({
        url: `/plan-periods/${id}/unlock/`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PlanPeriods', id }, 'PlanPeriods'],
    }),
  }),
})

export const {
  useListPlanPeriodsQuery,
  useGetPlanPeriodQuery,
  useCreatePlanPeriodMutation,
  useSubmitPlanPeriodMutation,
  useApprovePlanPeriodMutation,
  useLockPlanPeriodMutation,
  useUnlockPlanPeriodMutation,
} = planPeriodsApi

