import { baseApi } from './baseApi'
import { ActualExpense } from '@/entities/actual-expense/model'

export type ActualExpenseScope = 'OFFICE' | 'PROJECT' | 'CHARITY'

export interface ActualExpenseListParams {
  month?: string // YYYY-MM (required for list by month+scope)
  scope?: ActualExpenseScope
  category?: number | 'null'
  start_date?: string
  end_date?: string
  spent_at?: string
  ordering?: string
  page?: number
  account?: 'CASH' | 'BANK'
}

export interface ActualExpenseVendorBreakdown {
  vendor: string
  count: number
  amount: string
}

export interface ActualExpenseListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ActualExpense[]
  // Optional drill-down metadata for month+category slices
  total_count?: number
  total_amount?: string
  vendor_breakdown?: ActualExpenseVendorBreakdown[]
}

/** Payload for creating an actual expense: month + scope + account (backend resolves month_period). */
export interface CreateActualExpensePayload {
  month: string // YYYY-MM
  scope: ActualExpenseScope
  account: 'CASH' | 'BANK'
  category?: number | null
  amount: number
  spent_at: string
  comment: string
}

export const actualExpensesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listActualExpenses: builder.query<ActualExpenseListResponse, ActualExpenseListParams | void>({
      query: (params) => ({
        url: '/actual-expenses/',
        params,
      }),
      providesTags: ['ActualExpenses', 'Report'],
    }),
    getActualExpense: builder.query<ActualExpense, number>({
      query: (id) => ({ url: `/actual-expenses/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'ActualExpenses', id }],
    }),
    createActualExpense: builder.mutation<ActualExpense, CreateActualExpensePayload>({
      query: (body) => ({
        url: '/actual-expenses/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['ActualExpenses', 'Report'],
    }),
    updateActualExpense: builder.mutation<ActualExpense, { id: number; data: Partial<Pick<ActualExpense, 'amount' | 'spent_at' | 'comment' | 'category' | 'account'>> }>({
      query: ({ id, data }) => ({
        url: `/actual-expenses/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ActualExpenses', id },
        'ActualExpenses',
        'Report',
      ],
    }),
    deleteActualExpense: builder.mutation<void, number>({
      query: (id) => ({
        url: `/actual-expenses/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ActualExpenses', 'Report'],
    }),

  }),
})

export const {
  useListActualExpensesQuery,
  useGetActualExpenseQuery,
  useCreateActualExpenseMutation,
  useUpdateActualExpenseMutation,
  useDeleteActualExpenseMutation,
} = actualExpensesApi

export type { ActualExpense } from '@/entities/actual-expense/model'
