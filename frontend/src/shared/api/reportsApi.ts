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
}

export type ReportSectionType = 'income_sources' | 'expense_categories'
export type ReportDetailTarget = number | 'null'

export interface ExportSectionPdfParams {
  month: string
  sectionType: ReportSectionType
}

export interface ExportIncomeSourceDetailPdfParams {
  month: string
  sourceId: ReportDetailTarget
}

export interface ExportExpenseCategoryDetailPdfParams {
  month: string
  categoryId: ReportDetailTarget
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
      query: ({ month }) => ({
        url: '/reports/dashboard-expense-categories/',
        params: { month },
      }),
      providesTags: ['Report'],
    }),
    getDashboardIncomeSources: builder.query<
      DashboardIncomeSourcesResponse,
      DashboardIncomeSourcesParams
    >({
      query: ({ month }) => ({
        url: '/reports/dashboard-income-sources/',
        params: { month },
      }),
      providesTags: ['Report'],
    }),
    exportSectionPdf: builder.mutation<Blob, ExportSectionPdfParams>({
      query: ({ month, sectionType }) => ({
        url: '/reports/export-section-pdf/',
        params: {
          month,
          section_type: sectionType,
        },
        responseType: 'blob',
      }),
    }),
    exportIncomeSourceDetailPdf: builder.mutation<Blob, ExportIncomeSourceDetailPdfParams>({
      query: ({ month, sourceId }) => ({
        url: '/reports/export-income-source-detail-pdf/',
        params: {
          month,
          source_id: sourceId,
        },
        responseType: 'blob',
      }),
    }),
    exportExpenseCategoryDetailPdf: builder.mutation<Blob, ExportExpenseCategoryDetailPdfParams>({
      query: ({ month, categoryId }) => ({
        url: '/reports/export-expense-category-detail-pdf/',
        params: {
          month,
          category_id: categoryId,
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
