import { baseApi } from './baseApi'
import { Expense } from '@/entities/expense/model'

export interface ExpenseListParams {
  plan_period?: number
  category?: number
  spent_at?: string
  search?: string
  ordering?: string
  page?: number
}

export interface ExpenseListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Expense[]
}

export const expensesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listExpenses: builder.query<ExpenseListResponse, ExpenseListParams | void>({
      query: (params) => ({
        url: '/expenses/',
        params,
      }),
      providesTags: ['Expenses'],
    }),
    getExpense: builder.query<Expense, number>({
      query: (id) => ({ url: `/expenses/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'Expenses', id }],
    }),
    createExpense: builder.mutation<Expense, Partial<Expense>>({
      query: (body) => ({
        url: '/expenses/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Expenses'],
    }),
    updateExpense: builder.mutation<Expense, { id: number; data: Partial<Expense> }>({
      query: ({ id, data }) => ({
        url: `/expenses/${id}/`,
        method: 'PATCH',
        data: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Expenses', id }, 'Expenses'],
    }),
    deleteExpense: builder.mutation<void, number>({
      query: (id) => ({
        url: `/expenses/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Expenses'],
    }),
  }),
})

export const {
  useListExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
} = expensesApi

export type { Expense } from '@/entities/expense/model'

