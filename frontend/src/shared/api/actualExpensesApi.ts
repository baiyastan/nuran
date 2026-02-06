import { baseApi } from './baseApi'
import { ActualExpense, ProrabPlanSummary, ProrabPlanExpense } from '@/entities/actual-expense/model'

export interface ActualExpenseListParams {
  project?: number
  period?: number
  prorab_plan?: number
  spent_at?: string
  search?: string
  ordering?: string
  page?: number
}

export interface ActualExpenseListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ActualExpense[]
}

export const actualExpensesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Admin endpoints
    listActualExpenses: builder.query<ActualExpenseListResponse, ActualExpenseListParams | void>({
      query: (params) => ({
        url: '/actual-expenses/',
        params,
      }),
      providesTags: ['ActualExpenses'],
    }),
    getActualExpense: builder.query<ActualExpense, number>({
      query: (id) => ({ url: `/actual-expenses/${id}/` }),
      providesTags: (result, error, id) => [{ type: 'ActualExpenses', id }],
    }),
    createActualExpense: builder.mutation<ActualExpense, Partial<ActualExpense>>({
      query: (body) => ({
        url: '/actual-expenses/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['ActualExpenses', 'ProrabPlan'],
    }),
    updateActualExpense: builder.mutation<ActualExpense, { id: number; data: Partial<ActualExpense> }>({
      query: ({ id, data }) => ({
        url: `/actual-expenses/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { id }) => [
        { type: 'ActualExpenses', id },
        'ActualExpenses',
        'ProrabPlan',
      ],
    }),
    deleteActualExpense: builder.mutation<void, number>({
      query: (id) => ({
        url: `/actual-expenses/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ActualExpenses', 'ProrabPlan'],
    }),
    
    // Prorab endpoints
    getProrabPlanSummary: builder.query<ProrabPlanSummary, number>({
      query: (planId) => ({ url: `/prorab/plans/${planId}/summary/` }),
      providesTags: (result, error, planId) => [{ type: 'ProrabPlan', id: planId }],
    }),
    getProrabPlanExpenses: builder.query<ProrabPlanExpense[], number>({
      query: (planId) => ({ url: `/prorab/plans/${planId}/expenses/` }),
      providesTags: (result, error, planId) => [{ type: 'ProrabPlan', id: planId }],
    }),
  }),
})

export const {
  useListActualExpensesQuery,
  useGetActualExpenseQuery,
  useCreateActualExpenseMutation,
  useUpdateActualExpenseMutation,
  useDeleteActualExpenseMutation,
  useGetProrabPlanSummaryQuery,
  useGetProrabPlanExpensesQuery,
} = actualExpensesApi

