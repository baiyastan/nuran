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
}

export type ReportSectionType = 'income_sources' | 'expense_categories'
export type ReportDetailTarget = number | 'null'

export interface ExportSectionPdfParams {
  month: string
  sectionType: ReportSectionType
  /** When sectionType is expense_categories, pass to export filtered data; omit for "Все" */
  account?: 'CASH' | 'BANK'
}

export interface ExportIncomeSourceDetailPdfParams {
  month: string
  sourceId: ReportDetailTarget
  account?: 'CASH' | 'BANK'
}

export interface ExportExpenseCategoryDetailPdfParams {
  month: string
  categoryId: ReportDetailTarget
  account?: 'CASH' | 'BANK'
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
      query: ({ month, account }) => ({
        url: '/reports/dashboard-expense-categories/',
        params: account ? { month, account } : { month },
      }),
      providesTags: ['Report'],
    }),
    getDashboardIncomeSources: builder.query<
      DashboardIncomeSourcesResponse,
      DashboardIncomeSourcesParams
    >({
      query: ({ month, account }) => ({
        url: '/reports/dashboard-income-sources/',
        params: account ? { month, account } : { month },
      }),
      providesTags: ['Report'],
    }),
    exportSectionPdf: builder.mutation<Blob, ExportSectionPdfParams>({
      query: ({ month, sectionType, account }) => ({
        url: '/reports/export-section-pdf/',
        params: {
          month,
          section_type: sectionType,
          ...(sectionType === 'expense_categories' && account && { account }),
          ...(sectionType === 'income_sources' && account && { account }),
        },
        responseType: 'blob',
      }),
    }),
    exportIncomeSourceDetailPdf: builder.mutation<Blob, ExportIncomeSourceDetailPdfParams>({
      query: ({ month, sourceId, account }) => ({
        url: '/reports/export-income-source-detail-pdf/',
        params: {
          month,
          source_id: sourceId,
          ...(account && { account }),
        },
        responseType: 'blob',
      }),
    }),
    exportExpenseCategoryDetailPdf: builder.mutation<Blob, ExportExpenseCategoryDetailPdfParams>({
      query: ({ month, categoryId, account }) => ({
        url: '/reports/export-expense-category-detail-pdf/',
        params: {
          month,
          category_id: categoryId,
          ...(account && { account }),
        },
        responseType: 'blob',
      }),
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
} = reportsApi
