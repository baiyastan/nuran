import { baseApi } from './baseApi'

export interface ExpenseCategory {
  id: number
  name: string
  scope: 'project' | 'office' | 'charity'
  parent: number | null
  parent_id: number | null
  is_active: boolean
  is_system_root: boolean
  children_count?: number
  created_at: string
  updated_at: string
}

export interface ExpenseCategoryListParams {
  scope?: 'project' | 'office' | 'charity'
  parent?: number | null
  is_active?: boolean
  ordering?: string
  is_system_root?: boolean
}

export interface ExpenseCategoryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ExpenseCategory[]
}

export interface CreateExpenseCategoryRequest {
  name: string
  scope: 'project' | 'office' | 'charity'
  parent?: number | null
}

export interface UpdateExpenseCategoryRequest {
  name?: string
  scope?: 'project' | 'office' | 'charity'
  parent?: number | null
  is_active?: boolean
}

export const expenseCategoriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listExpenseCategories: builder.query<ExpenseCategoryListResponse, ExpenseCategoryListParams | void>({
      query: (params) => {
        const searchParams: Record<string, string> = {}
        if (params?.scope) {
          searchParams.scope = params.scope
        }
        if (params?.parent !== undefined) {
          searchParams.parent = params.parent === null ? 'null' : String(params.parent)
        }
        if (params?.is_active !== undefined) {
          searchParams.is_active = String(params.is_active)
        }
        if (params?.ordering) {
          searchParams.ordering = params.ordering
        }
        if (params?.is_system_root !== undefined) {
          searchParams.is_system_root = String(params.is_system_root)
        }
        return {
          url: '/budgets/expense-categories/',
          params: Object.keys(searchParams).length > 0 ? searchParams : undefined,
        }
      },
      providesTags: ['ExpenseCategories'],
    }),
    createExpenseCategory: builder.mutation<ExpenseCategory, CreateExpenseCategoryRequest>({
      query: (data) => ({
        url: '/budgets/expense-categories/',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['ExpenseCategories'],
    }),
    updateExpenseCategory: builder.mutation<ExpenseCategory, { id: number; data: UpdateExpenseCategoryRequest }>({
      query: ({ id, data }) => ({
        url: `/budgets/expense-categories/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: ['ExpenseCategories'],
    }),
    deleteExpenseCategory: builder.mutation<void, number>({
      query: (id) => ({
        url: `/budgets/expense-categories/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['ExpenseCategories'],
    }),
  }),
})

export const {
  useListExpenseCategoriesQuery,
  useCreateExpenseCategoryMutation,
  useUpdateExpenseCategoryMutation,
  useDeleteExpenseCategoryMutation,
} = expenseCategoriesApi

