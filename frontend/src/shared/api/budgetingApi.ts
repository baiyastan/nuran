import { baseApi } from './baseApi'

export interface ExpenseCategory {
  id: number
  name: string
  scope: 'project' | 'office' | 'charity'
  kind: 'EXPENSE' | 'INCOME'
  parent: number | null
  parent_id: number | null
  is_active: boolean
  children_count: number
  created_at: string
  updated_at: string
}

export interface BudgetPlan {
  id: number
  period: number
  period_month: string
  root_category: number
  root_category_name: string
  scope: 'OFFICE' | 'PROJECT' | 'CHARITY'
  project: number | null
  project_name: string | null
  status: 'DRAFT' | 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'CLOSED'
  submitted_at: string | null
  approved_by: number | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface BudgetLine {
  id: number
  plan: number
  category: number
  category_name: string
  amount_planned: string
  note: string
  plan_status: string
  created_at: string
  updated_at: string
}

export interface BudgetPlanListParams {
  month?: string
  project?: number
  status?: string
  root_category?: number
  page?: number
}

export interface BudgetPlanListResponse {
  count: number
  next: string | null
  previous: string | null
  results: BudgetPlan[]
}

export interface BudgetLineListParams {
  plan?: number
  category?: number
  page?: number
}

export interface BudgetLineListResponse {
  count: number
  next: string | null
  previous: string | null
  results: BudgetLine[]
}

export interface ExpenseCategoryListParams {
  scope?: string
  kind?: string
  is_active?: boolean
  parent?: number | null
  page?: number
}

export interface ExpenseCategoryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ExpenseCategory[]
}

export interface CreateBudgetPlanRequest {
  period: string | number
  root_category: number
  scope?: 'OFFICE' | 'PROJECT' | 'CHARITY'
  project?: number | null
}

export interface CreateBudgetLineRequest {
  plan: number
  category: number
  amount_planned: number
  note?: string
}

export interface UpdateBudgetLineRequest {
  category?: number
  amount_planned?: number
  note?: string
}

export interface BudgetExpense {
  id: number
  plan: number
  category: number
  category_name: string
  amount_spent: string
  comment: string
  spent_at: string
  created_by: number | null
  created_by_username: string | null
  created_at: string
  updated_at: string
}

export interface BudgetExpenseListParams {
  plan?: number
  project?: number
  month?: string
  category?: number
  page?: number
}

export interface BudgetExpenseListResponse {
  count: number
  next: string | null
  previous: string | null
  results: BudgetExpense[]
}

export interface CreateBudgetExpenseRequest {
  plan: number
  category: number
  amount_spent: number
  comment?: string
  spent_at: string
}

export interface UpdateBudgetExpenseRequest {
  category?: number
  amount_spent?: number
  comment?: string
  spent_at?: string
}

export interface BudgetPlanReportRow {
  category_id: number
  category_name: string
  planned: string
  spent: string
  balance: string
  percent: number | null
}

export interface BudgetPlanReport {
  plan: {
    id: number
    period_month: string
    project_name: string | null
    status: string
  }
  rows: BudgetPlanReportRow[]
  totals: {
    planned: string
    spent: string
    balance: string
    percent: number | null
  }
}

export const budgetingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProjectBudgetPlan: builder.query<BudgetPlan | null, { month: string; projectId: number }>({
      query: ({ month, projectId }) => ({
        url: '/budgets/',
        params: { month, project: projectId },
      }),
      transformResponse: (response: BudgetPlanListResponse) => {
        return response.results && response.results.length > 0 ? response.results[0] : null
      },
      providesTags: (result, error, arg) => [
        { type: 'Budget', id: result?.id },
        'Budget',
      ],
    }),

    listBudgetPlans: builder.query<BudgetPlanListResponse, BudgetPlanListParams | void>({
      query: (params) => ({
        url: '/budgets/',
        params,
      }),
      providesTags: ['Budget'],
    }),

    getBudgetPlan: builder.query<BudgetPlan, number>({
      query: (id) => ({ url: `/budgets/${id}/` }),
      providesTags: (result, error, id) => [{ type: 'Budget', id }],
    }),

    createBudgetPlan: builder.mutation<BudgetPlan, CreateBudgetPlanRequest>({
      query: (body) => ({
        url: '/budgets/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Budget'],
    }),

    updateBudgetPlan: builder.mutation<BudgetPlan, { id: number; data: Partial<CreateBudgetPlanRequest> }>({
      query: ({ id, data }) => ({
        url: `/budgets/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Budget', id }, 'Budget'],
    }),

    submitBudgetPlan: builder.mutation<BudgetPlan, number>({
      query: (id) => ({
        url: `/budgets/${id}/submit/`,
        method: 'POST',
      }),
      invalidatesTags: (result, error, id) => [{ type: 'Budget', id }, 'Budget'],
    }),

    approveBudgetPlan: builder.mutation<BudgetPlan, { id: number; comments?: string }>({
      query: ({ id, comments }) => ({
        url: `/budgets/${id}/approve/`,
        method: 'POST',
        data: comments ? { comments } : {},
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'Budget', id }, 'Budget'],
    }),

    listExpenseCategories: builder.query<ExpenseCategoryListResponse, ExpenseCategoryListParams | void>({
      query: (params) => ({
        url: '/expense-categories/',
        params,
      }),
      providesTags: ['ExpenseCategories'],
    }),

    listBudgetLines: builder.query<BudgetLineListResponse, BudgetLineListParams | void>({
      query: (params) => ({
        url: '/budget-lines/',
        params,
      }),
      providesTags: ['Budget'],
    }),

    createBudgetLine: builder.mutation<BudgetLine, CreateBudgetLineRequest>({
      query: (body) => ({
        url: '/budget-lines/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Budget'],
    }),

    updateBudgetLine: builder.mutation<BudgetLine, { id: number; data: UpdateBudgetLineRequest }>({
      query: ({ id, data }) => ({
        url: `/budget-lines/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: ['Budget'],
    }),

    deleteBudgetLine: builder.mutation<void, number>({
      query: (id) => ({
        url: `/budget-lines/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Budget'],
    }),

    listBudgetExpenses: builder.query<BudgetExpenseListResponse, BudgetExpenseListParams | void>({
      query: (params) => ({
        url: '/expenses/',
        params,
      }),
      providesTags: ['Budget'],
    }),

    getBudgetExpense: builder.query<BudgetExpense, number>({
      query: (id) => ({ url: `/expenses/${id}/` }),
      providesTags: (result, error, id) => [{ type: 'Budget', id }],
    }),

    createBudgetExpense: builder.mutation<BudgetExpense, CreateBudgetExpenseRequest>({
      query: (body) => ({
        url: '/expenses/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Budget'],
    }),

    updateBudgetExpense: builder.mutation<BudgetExpense, { id: number; data: UpdateBudgetExpenseRequest }>({
      query: ({ id, data }) => ({
        url: `/expenses/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: ['Budget'],
    }),

    deleteBudgetExpense: builder.mutation<void, number>({
      query: (id) => ({
        url: `/expenses/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Budget'],
    }),

    getBudgetPlanReport: builder.query<BudgetPlanReport, number>({
      query: (id) => ({ url: `/budgets/${id}/report/` }),
      providesTags: (result, error, id) => [{ type: 'Budget', id }, 'Budget'],
    }),
  }),
})

export const {
  useGetProjectBudgetPlanQuery,
  useListBudgetPlansQuery,
  useGetBudgetPlanQuery,
  useCreateBudgetPlanMutation,
  useUpdateBudgetPlanMutation,
  useSubmitBudgetPlanMutation,
  useApproveBudgetPlanMutation,
  useListExpenseCategoriesQuery,
  useListBudgetLinesQuery,
  useCreateBudgetLineMutation,
  useUpdateBudgetLineMutation,
  useDeleteBudgetLineMutation,
  useListBudgetExpensesQuery,
  useGetBudgetExpenseQuery,
  useCreateBudgetExpenseMutation,
  useUpdateBudgetExpenseMutation,
  useDeleteBudgetExpenseMutation,
  useGetBudgetPlanReportQuery,
} = budgetingApi

