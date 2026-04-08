import { baseApi } from './baseApi'

export interface MonthlyReportRow {
  category_id: number | null
  category_name: string
  planned: number
  actual: number
  delta: number
  percent: number | null
}

export interface MonthlyReportResponse {
  month: string
  scope: string
  plan_id: number | null
  facts: {
    count: number
    total_actual: number
    uncategorized_count: number
  }
  totals: {
    planned: number
    actual: number
    delta: number
    percent: number
  }
  rows: MonthlyReportRow[]
  uncategorized: {
    planned: number
    actual: number
    delta: number
  }
}

export interface MonthlyReportParams {
  month: string // YYYY-MM
  scope: 'OFFICE' | 'PROJECT' | 'CHARITY'
}

export interface DashboardKpiResponse {
  month: string
  income_fact: string
  expense_fact: string
  /** Sum of apps.planning.ActualExpense for the month; not in expense_fact or balance. */
  planning_actual_expense_total: string
  net: string
  income_plan: string
  expense_plan: string
  net_plan: string
  cash_balance: string
  bank_balance: string
  cash_opening_balance: string
  bank_opening_balance: string
  cash_inflow_month: string
  cash_outflow_month: string
  bank_inflow_month: string
  bank_outflow_month: string
  cash_closing_balance: string
  bank_closing_balance: string
  bank_to_cash_month: string
  cash_to_bank_month: string
}

export interface DashboardKpiParams {
  month: string // YYYY-MM
}

export interface DashboardExpenseCategoryRow {
  category_id: number | null
  category_name: string
  plan: string
  fact: string
  diff: string
  count: number
  sharePercent: number | null
}

export interface DashboardExpenseCategoriesResponse {
  month: string
  totals: {
    plan: string
    fact: string
  }
  rows: DashboardExpenseCategoryRow[]
}

export interface DashboardExpenseCategoriesParams {
  month: string // YYYY-MM
  account?: 'CASH' | 'BANK' // optional; omit or don't send for "all"
  start_date?: string
  end_date?: string
}

export interface DashboardIncomeSourceRow {
  source_id: number | null
  source_name: string | null
  plan: string
  fact: string
  diff: string
  count: number
  sharePercent: number | null
}

export interface DashboardIncomeSourcesResponse {
  month: string
  totals: {
    plan: string
    fact: string
  }
  rows: DashboardIncomeSourceRow[]
}

export interface DashboardIncomeSourcesParams {
  month: string // YYYY-MM
  account?: 'CASH' | 'BANK' // optional; omit for "all"
  start_date?: string
  end_date?: string
}

export type ReportSectionType = 'income_sources' | 'expense_categories'
export type ReportDetailTarget = number | 'null'

export interface ExportSectionPdfParams {
  month: string
  sectionType: ReportSectionType
  /** When sectionType is expense_categories, pass to export filtered data; omit for "Все" */
  account?: 'CASH' | 'BANK'
  start_date?: string
  end_date?: string
}

export interface ExportIncomeSourceDetailPdfParams {
  month: string
  sourceId: ReportDetailTarget
  account?: 'CASH' | 'BANK'
  start_date?: string
  end_date?: string
}

export interface ExportExpenseCategoryDetailPdfParams {
  month: string
  categoryId: ReportDetailTarget
  account?: 'CASH' | 'BANK'
  start_date?: string
  end_date?: string
}

export interface TransferDetailItem {
  id: number
  transferred_at: string
  source_account: 'CASH' | 'BANK'
  destination_account: 'CASH' | 'BANK'
  amount: string
  comment: string
  created_by_username: string | null
}

export interface TransferDetailsResponse {
  month: string
  bank_to_cash: TransferDetailItem[]
  cash_to_bank: TransferDetailItem[]
}

export interface TransferDetailsParams {
  month: string
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMonthlyReport: builder.query<MonthlyReportResponse, MonthlyReportParams>({
      query: ({ month, scope }) => ({
        url: '/reports/monthly/',
        params: { month, scope },
      }),
      providesTags: ['Report'],
    }),
    getDashboardKpi: builder.query<DashboardKpiResponse, DashboardKpiParams>({
      query: ({ month }) => ({
        url: '/reports/dashboard-kpis/',
        params: { month },
      }),
      providesTags: ['Report'],
    }),
    getDashboardExpenseCategories: builder.query<
      DashboardExpenseCategoriesResponse,
      DashboardExpenseCategoriesParams
    >({
      query: ({ month, account, start_date, end_date }) => ({
        url: '/reports/dashboard-expense-categories/',
        params: {
          month,
          ...(account ? { account } : {}),
          ...(start_date && end_date ? { start_date, end_date } : {}),
        },
      }),
      providesTags: ['Report'],
    }),
    getDashboardIncomeSources: builder.query<
      DashboardIncomeSourcesResponse,
      DashboardIncomeSourcesParams
    >({
      query: ({ month, account, start_date, end_date }) => ({
        url: '/reports/dashboard-income-sources/',
        params: {
          month,
          ...(account ? { account } : {}),
          ...(start_date && end_date ? { start_date, end_date } : {}),
        },
      }),
      providesTags: ['Report'],
    }),
    exportSectionPdf: builder.mutation<Blob, ExportSectionPdfParams>({
      query: ({ month, sectionType, account, start_date, end_date }) => ({
        url: '/reports/export-section-pdf/',
        params: {
          month,
          section_type: sectionType,
          ...(sectionType === 'expense_categories' && account && { account }),
          ...(sectionType === 'income_sources' && account && { account }),
          ...(start_date && end_date && { start_date, end_date }),
        },
        responseType: 'blob',
      }),
    }),
    exportIncomeSourceDetailPdf: builder.mutation<Blob, ExportIncomeSourceDetailPdfParams>({
      query: ({ month, sourceId, account, start_date, end_date }) => ({
        url: '/reports/export-income-source-detail-pdf/',
        params: {
          month,
          source_id: sourceId,
          ...(account && { account }),
          ...(start_date && end_date && { start_date, end_date }),
        },
        responseType: 'blob',
      }),
    }),
    exportExpenseCategoryDetailPdf: builder.mutation<Blob, ExportExpenseCategoryDetailPdfParams>({
      query: ({ month, categoryId, account, start_date, end_date }) => ({
        url: '/reports/export-expense-category-detail-pdf/',
        params: {
          month,
          category_id: categoryId,
          ...(account && { account }),
          ...(start_date && end_date && { start_date, end_date }),
        },
        responseType: 'blob',
      }),
    }),
    getTransferDetails: builder.query<TransferDetailsResponse, TransferDetailsParams>({
      query: ({ month }) => ({
        url: '/reports/transfer-details/',
        params: { month },
      }),
      providesTags: ['Report'],
    }),
  }),
})

export const {
  useGetMonthlyReportQuery,
  useGetDashboardKpiQuery,
  useGetDashboardExpenseCategoriesQuery,
  useGetDashboardIncomeSourcesQuery,
  useExportSectionPdfMutation,
  useExportIncomeSourceDetailPdfMutation,
  useExportExpenseCategoryDetailPdfMutation,
  useGetTransferDetailsQuery,
} = reportsApi
