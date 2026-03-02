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
  month: string  // YYYY-MM format
  scope: 'OFFICE' | 'PROJECT' | 'CHARITY'
  project?: number
  status?: string
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
  parent?: number | null | 'null'
  page?: number
}

export interface ExpenseCategoryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ExpenseCategory[]
}

export interface CreateBudgetPlanRequest {
  period: number  // MonthPeriod PK
  scope: 'OFFICE' | 'PROJECT' | 'CHARITY'
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
  planned: number
  spent: number
  balance: number
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
    planned: number
    spent: number
    balance: number
    percent: number | null
  }
}

export const budgetingApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getProjectBudgetPlan: builder.query<BudgetPlan | null, { month: string; projectId: number }>({
      query: ({ month, projectId }) => ({
        url: '/budgets/budgets/',
        params: { month, project: projectId },
      }),
      transformResponse: (response: BudgetPlanListResponse) => {
        return response.results && response.results.length > 0 ? response.results[0] : null
      },
      providesTags: (result, _error, _arg) => [
        { type: 'Budget', id: result?.id },
        'Budget',
      ],
    }),

    listBudgetPlans: builder.query<BudgetPlanListResponse, BudgetPlanListParams>({
      query: (params) => {
        if (!params.month || !params.scope) {
          throw new Error('month and scope are required')
        }
        return {
          url: '/budgets/budgets/',
          params: {
            month: params.month,
            scope: params.scope,
            project: params.project,
            status: params.status,
            page: params.page,
          },
        }
      },
      providesTags: (_result, _error, arg) => [
        // Month + scope (+ project) are part of the cache identity for plan lists
        { type: 'BudgetList', id: `${arg.month}-${arg.scope}-${arg.project || 'none'}` },
        'Budget',
      ],
    }),

    getBudgetPlan: builder.query<BudgetPlan, number>({
      query: (id) => ({ url: `/budgets/budgets/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'Budget', id }],
    }),

    createBudgetPlan: builder.mutation<BudgetPlan, CreateBudgetPlanRequest>({
      query: (body) => ({
        url: '/budgets/budgets/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, _error, _arg) => {
        if (!result) return ['Budget', 'BudgetList']
        const tagId = `${result.period_month}-${result.scope}-${result.project || 'none'}`
        return [
          { type: 'Budget', id: result.id },
          { type: 'BudgetList', id: tagId },
          'Budget',
          'BudgetList',
        ]
      },
    }),

    updateBudgetPlan: builder.mutation<BudgetPlan, { id: number; data: Partial<CreateBudgetPlanRequest> }>({
      query: ({ id, data }) => ({
        url: `/budgets/budgets/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, _error, { id }) => {
        if (!result) {
          return [{ type: 'Budget', id }, 'Budget']
        }
        const tagId = `${result.period_month}-${result.scope}-${result.project || 'none'}`
        return [
          { type: 'Budget', id },
          { type: 'BudgetList', id: tagId },
          'Budget',
          'BudgetList',
        ]
      },
    }),

    submitBudgetPlan: builder.mutation<BudgetPlan, number>({
      query: (id) => ({
        url: `/budgets/budgets/${id}/submit/`,
        method: 'POST',
      }),
      invalidatesTags: (result, _error, id) => {
        if (!result) {
          return [{ type: 'Budget', id }, 'Budget']
        }
        const tagId = `${result.period_month}-${result.scope}-${result.project || 'none'}`
        return [
          { type: 'Budget', id },
          { type: 'BudgetList', id: tagId },
          'Budget',
          'BudgetList',
        ]
      },
    }),

    approveBudgetPlan: builder.mutation<BudgetPlan, { id: number; comments?: string }>({
      query: ({ id, comments }) => ({
        url: `/budgets/budgets/${id}/approve/`,
        method: 'POST',
        data: comments ? { comments } : {},
      }),
      invalidatesTags: (result, _error, { id }) => {
        if (!result) {
          return [{ type: 'Budget', id }, 'Budget']
        }
        const tagId = `${result.period_month}-${result.scope}-${result.project || 'none'}`
        return [
          { type: 'Budget', id },
          { type: 'BudgetList', id: tagId },
          'Budget',
          'BudgetList',
        ]
      },
    }),

    listExpenseCategories: builder.query<ExpenseCategoryListResponse, ExpenseCategoryListParams | void>({
      query: (params) => ({
        url: '/budgets/expense-categories/',
        params,
      }),
      providesTags: ['ExpenseCategories'],
    }),

    listBudgetLines: builder.query<BudgetLineListResponse, BudgetLineListParams | void>({
      query: (params) => ({
        url: '/budgets/budget-lines/',
        params,
      }),
      providesTags: ['Budget'],
    }),

    createBudgetLine: builder.mutation<BudgetLine, CreateBudgetLineRequest>({
      query: (body) => ({
        url: '/budgets/budget-lines/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (_result, _error, _arg) => {
        // Need to fetch plan to get month+scope+project
        // For now, invalidate all Budget tags (can optimize later with plan lookup)
        return ['Budget', 'BudgetList']
      },
    }),

    updateBudgetLine: builder.mutation<BudgetLine, { id: number; data: UpdateBudgetLineRequest }>({
      query: ({ id, data }) => ({
        url: `/budgets/budget-lines/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, _arg) => {
        // Need to fetch plan to get month+scope+project
        return ['Budget', 'BudgetList']
      },
    }),

    deleteBudgetLine: builder.mutation<void, number>({
      query: (id) => ({
        url: `/budgets/budget-lines/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, _arg) => {
        // Need to fetch plan to get month+scope+project
        return ['Budget', 'BudgetList']
      },
    }),

    bulkUpsertBudgetLines: builder.mutation<
      { plan: number; updated: number; created: number; deleted: number; lines: BudgetLine[] },
      { plan: number; items: Array<{ category: number; amount_planned: string; note?: string }> }
    >({
      query: (body) => ({
        url: '/budgets/budget-lines/bulk-upsert/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        'Budget',
        { type: 'Budget', id: arg.plan },
        'BudgetList',
      ],
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
      providesTags: (_result, _error, id) => [{ type: 'Budget', id }],
    }),

    createBudgetExpense: builder.mutation<BudgetExpense, CreateBudgetExpenseRequest>({
      query: (body) => ({
        url: '/expenses/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (_result, _error, _arg) => {
        // Need to fetch plan to get month+scope+project
        return ['Budget', 'BudgetList']
      },
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
      query: (id) => ({ url: `/budgets/budgets/${id}/report/` }),
      providesTags: (_result, _error, id) => [{ type: 'Budget', id }, 'Budget'],
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
  useBulkUpsertBudgetLinesMutation,
  useListBudgetExpensesQuery,
  useGetBudgetExpenseQuery,
  useCreateBudgetExpenseMutation,
  useUpdateBudgetExpenseMutation,
  useDeleteBudgetExpenseMutation,
  useGetBudgetPlanReportQuery,
} = budgetingApi

