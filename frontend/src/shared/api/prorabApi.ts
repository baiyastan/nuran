import { baseApi } from './baseApi'

export interface ProjectAssignment {
  id: number
  project: number
  project_name: string
  prorab: number
  prorab_email: string
  assigned_at: string
}

export interface ProrabProject {
  id: number
  name: string
  description: string
  status: 'active' | 'completed' | 'on_hold'
  created_by: number
  created_by_username: string
  assigned_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProrabPlanPeriod {
  id: number
  project: number
  project_name: string
  period: string
  status: string
  limit_amount?: string
  created_at: string
  updated_at: string
}

export interface ProrabPlanItem {
  id: number
  plan: number
  category: number
  category_name?: string
  name: string
  amount: string
  created_by?: number
  created_by_username?: string
  created_at: string
  updated_at: string
}

export interface ProrabPlan {
  id: number
  period: number
  period_period: string
  period_status: string
  project_name: string
  prorab: number
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  total_amount: string
  limit_amount?: string
  submitted_at?: string
  approved_at?: string
  rejected_at?: string
  comments: string
  items: ProrabPlanItem[]
  created_at: string
  updated_at: string
}

export interface ProjectAssignmentListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProjectAssignment[]
}

export interface ProrabProjectListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProrabProject[]
}

export interface ProrabPlanPeriodListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ProrabPlanPeriod[]
}

export interface CreateProrabPlanItemRequest {
  category: number
  name: string
  amount: number
}

export interface UpdateProrabPlanItemRequest {
  category?: number
  name?: string
  amount?: number
}

export const prorabApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProrabProjects: builder.query<ProrabProjectListResponse, void>({
      query: () => ({ url: '/prorab/projects/' }),
      providesTags: ['ProrabProjects'],
    }),
    getProrabPlanPeriods: builder.query<ProrabPlanPeriodListResponse, number>({
      query: (projectId) => ({ url: `/prorab/projects/${projectId}/plan-periods/` }),
      providesTags: ['ProrabPlanPeriods'],
    }),
    getProrabPlan: builder.query<ProrabPlan, number>({
      query: (periodId) => ({ url: `/prorab/plan-periods/${periodId}/plan/` }),
      providesTags: (result, error, periodId) => [{ type: 'ProrabPlan', id: periodId }],
    }),
    createProrabPlanItem: builder.mutation<ProrabPlanItem, { planId: number; periodId?: number; data: CreateProrabPlanItemRequest }>({
      query: ({ planId, data }) => ({
        url: `/prorab/plans/${planId}/items/`,
        method: 'POST',
        data,
      }),
      invalidatesTags: (result, error, { periodId }) => {
        // Invalidate all plan queries to ensure totals update
        // If periodId is provided, invalidate specific query; otherwise invalidate all
        if (periodId) {
          return [{ type: 'ProrabPlan', id: periodId }, 'ProrabPlan']
        }
        return ['ProrabPlan']
      },
    }),
    updateProrabPlanItem: builder.mutation<ProrabPlanItem, { planId: number; periodId?: number; itemId: number; data: UpdateProrabPlanItemRequest }>({
      query: ({ planId, itemId, data }) => ({
        url: `/prorab/plans/${planId}/items/${itemId}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { periodId }) => {
        if (periodId) {
          return [{ type: 'ProrabPlan', id: periodId }, 'ProrabPlan']
        }
        return ['ProrabPlan']
      },
    }),
    deleteProrabPlanItem: builder.mutation<void, { planId: number; periodId?: number; itemId: number }>({
      query: ({ planId, itemId }) => ({
        url: `/prorab/plans/${planId}/items/${itemId}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (result, error, { periodId }) => {
        if (periodId) {
          return [{ type: 'ProrabPlan', id: periodId }, 'ProrabPlan']
        }
        return ['ProrabPlan']
      },
    }),
    submitProrabPlan: builder.mutation<ProrabPlan, number>({
      query: (planId) => ({
        url: `/prorab/plans/${planId}/submit/`,
        method: 'POST',
      }),
      invalidatesTags: (result) => {
        // Result contains the plan with period ID
        if (result?.period) {
          return [{ type: 'ProrabPlan', id: result.period }, 'ProrabPlan']
        }
        return ['ProrabPlan']
      },
    }),
  }),
})

export const {
  useGetProrabProjectsQuery,
  useGetProrabPlanPeriodsQuery,
  useGetProrabPlanQuery,
  useCreateProrabPlanItemMutation,
  useUpdateProrabPlanItemMutation,
  useDeleteProrabPlanItemMutation,
  useSubmitProrabPlanMutation,
} = prorabApi

