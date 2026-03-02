import { baseApi } from './baseApi'
import { FinancePeriod, IncomeSummaryResponse } from '@/entities/finance-period/model'

export interface FinancePeriodListParams {
  month_period?: number
  month?: string | number // YYYY-MM format string (backward compatibility) OR month integer (1-12)
  year?: number // Year as integer (e.g., 2024)
  fund_kind?: 'project' | 'office' | 'charity'
  project?: number
  status?: 'open' | 'locked' | 'closed'
  search?: string
  ordering?: string
  page?: number
}

export interface FinancePeriodListResponse {
  count: number
  next: string | null
  previous: string | null
  results: FinancePeriod[]
}

export const financePeriodsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listFinancePeriods: builder.query<FinancePeriodListResponse, FinancePeriodListParams | void>({
      query: (params) => {
        if (!params) {
          return {
            url: '/finance-periods/',
            params: {},
          }
        }

        const queryParams: Record<string, string | number> = {}
        
        // If year and month (as number) are provided, use them directly
        if (params.year !== undefined && typeof params.month === 'number') {
          queryParams.year = params.year
          queryParams.month = params.month
        }
        // If month is a string (YYYY-MM format), parse it to year and month
        else if (typeof params.month === 'string') {
          const [yearStr, monthStr] = params.month.split('-')
          if (yearStr && monthStr) {
            queryParams.year = parseInt(yearStr, 10)
            queryParams.month = parseInt(monthStr, 10)
          }
        }
        // If only year is provided but month is not, keep month as-is
        else if (params.year !== undefined) {
          queryParams.year = params.year
          if (params.month !== undefined) {
            queryParams.month = params.month
          }
        }
        // Otherwise, pass month as-is (could be string or number)
        else if (params.month !== undefined) {
          queryParams.month = params.month
        }

        // Add other params
        if (params.month_period !== undefined) {
          queryParams.month_period = params.month_period
        }
        if (params.fund_kind !== undefined) {
          queryParams.fund_kind = params.fund_kind
        }
        if (params.project !== undefined) {
          queryParams.project = params.project
        }
        if (params.status !== undefined) {
          queryParams.status = params.status
        }
        if (params.search !== undefined) {
          queryParams.search = params.search
        }
        if (params.ordering !== undefined) {
          queryParams.ordering = params.ordering
        }
        if (params.page !== undefined) {
          queryParams.page = params.page
        }

        return {
          url: '/finance-periods/',
          params: queryParams,
        }
      },
      providesTags: ['FinancePeriods'],
    }),
    getFinancePeriod: builder.query<FinancePeriod, number>({
      query: (id) => ({ url: `/finance-periods/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'FinancePeriods', id }],
    }),
    createFinancePeriod: builder.mutation<FinancePeriod, { month_period: number; fund_kind: 'office' | 'project' | 'charity'; project?: number | null }>({
      query: (body) => ({
        url: '/finance-periods/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['FinancePeriods'],
    }),
    updateFinancePeriod: builder.mutation<FinancePeriod, { id: number; data: Partial<FinancePeriod> }>({
      query: ({ id, data }) => ({
        url: `/finance-periods/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'FinancePeriods', id },
        'FinancePeriods',
      ],
    }),
    deleteFinancePeriod: builder.mutation<void, number>({
      query: (id) => ({
        url: `/finance-periods/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['FinancePeriods'],
    }),
    getIncomeSummary: builder.query<IncomeSummaryResponse, number>({
      query: (financePeriodId) => ({ url: `/finance-periods/${financePeriodId}/income-summary/` }),
      providesTags: (_result, _error, financePeriodId) => [{ type: 'FinancePeriodSummary', id: financePeriodId }],
    }),
  }),
})

export const {
  useListFinancePeriodsQuery,
  useGetFinancePeriodQuery,
  useCreateFinancePeriodMutation,
  useUpdateFinancePeriodMutation,
  useDeleteFinancePeriodMutation,
  useGetIncomeSummaryQuery,
} = financePeriodsApi

