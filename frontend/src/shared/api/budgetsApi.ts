import { baseApi } from './baseApi'

export interface BudgetPlan {
  id: number
  period: number
  scope: 'OFFICE' | 'PROJECT'
  project?: number
  status: 'DRAFT' | 'APPROVED' | 'CLOSED'
  approved_by?: number
  approved_at?: string
  created_at: string
  updated_at: string
}

export interface BudgetPlanReport {
  planned_total: string
  actual_total: string
  delta: string
  over_budget: boolean
  per_category: Array<{
    category_id: number
    category_name: string
    planned: string
    actual: string
    delta: string
  }>
  expenses: Array<{
    id: number
    date: string
    category_name: string
    amount: string
    comment: string
    created_by: string
  }>
  summary_comment: string | null
}

export interface UpdateSummaryCommentRequest {
  comment_text: string
}

export const budgetsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getBudgetReport: builder.query<BudgetPlanReport, number>({
      query: (budgetId) => ({
        url: `/reports/budget/${budgetId}/`,
      }),
      providesTags: (result, error, budgetId) => [{ type: 'Budget', id: budgetId }],
    }),
    updateSummaryComment: builder.mutation<
      { id: number; comment_text: string; updated_by: string | null; updated_at: string },
      { budgetId: number; data: UpdateSummaryCommentRequest }
    >({
      query: ({ budgetId, data }) => ({
        url: `/budgets/${budgetId}/summary-comment/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { budgetId }) => [{ type: 'Budget', id: budgetId }],
    }),
  }),
})

export const { useGetBudgetReportQuery, useUpdateSummaryCommentMutation } = budgetsApi

