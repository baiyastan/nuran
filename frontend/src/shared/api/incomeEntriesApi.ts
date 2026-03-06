import { baseApi } from './baseApi'
import { IncomeEntry } from '@/entities/income-entry/model'

export interface IncomeEntryListParams {
  finance_period?: number
  month?: string // YYYY-MM format
  fund_kind?: 'project' | 'office' | 'charity'
  project?: number
  search?: string
  ordering?: string
  page?: number
  source?: number | 'null'
}

export interface IncomeEntryListResponse {
  count: number
  next: string | null
  previous: string | null
  results: IncomeEntry[]
  total_count?: number
  total_amount?: string
  payer_breakdown?: {
    payer: string
    count: number
    amount: string
  }[]
}

export interface CreateIncomeEntryRequest {
  finance_period: number
  source_id?: number | null
  amount: number
  received_at: string
  comment: string
}

export interface UpdateIncomeEntryRequest {
  source_id?: number
  amount?: number
  received_at?: string
  comment?: string
}

export const incomeEntriesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listIncomeEntries: builder.query<IncomeEntryListResponse, IncomeEntryListParams | void>({
      query: (params) => ({
        url: '/income-entries/',
        params,
      }),
      providesTags: (_result, _error, params) => {
        const financePeriodId = params?.finance_period
        if (financePeriodId) {
          return [{ type: 'IncomeEntries', id: financePeriodId }, 'IncomeEntries']
        }
        return ['IncomeEntries']
      },
    }),
    getIncomeEntry: builder.query<IncomeEntry, number>({
      query: (id) => ({ url: `/income-entries/${id}/` }),
      providesTags: (result, _error, id) => [
        { type: 'IncomeEntries', id: result?.finance_period },
        { type: 'IncomeEntries', id },
        'IncomeEntries',
      ],
    }),
    createIncomeEntry: builder.mutation<IncomeEntry, CreateIncomeEntryRequest>({
      query: (body) => ({
        url: '/income-entries/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (result, _error, body) => {
        const financePeriodId = result?.finance_period || body.finance_period
        const tags: Array<{ type: 'IncomeEntries'; id?: number } | 'IncomeEntries' | 'FinancePeriodSummary' | { type: 'FinancePeriodSummary'; id: number }> = [
          'IncomeEntries',
          'FinancePeriodSummary', // Always invalidate broad tag as fallback
        ]
        if (financePeriodId) {
          tags.push({ type: 'IncomeEntries', id: financePeriodId })
          tags.push({ type: 'FinancePeriodSummary', id: financePeriodId })
        }
        return tags
      },
    }),
    updateIncomeEntry: builder.mutation<IncomeEntry, { id: number; data: UpdateIncomeEntryRequest }>({
      query: ({ id, data }) => ({
        url: `/income-entries/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, _error, { id, data: _data }) => {
        const financePeriodId = result?.finance_period
        const tags: Array<{ type: 'IncomeEntries'; id?: number } | 'IncomeEntries' | 'FinancePeriodSummary' | { type: 'FinancePeriodSummary'; id: number }> = [
          { type: 'IncomeEntries', id },
          'IncomeEntries',
          'FinancePeriodSummary', // Always invalidate broad tag as fallback
        ]
        if (financePeriodId) {
          tags.push({ type: 'IncomeEntries', id: financePeriodId })
          tags.push({ type: 'FinancePeriodSummary', id: financePeriodId })
        }
        return tags
      },
    }),
    deleteIncomeEntry: builder.mutation<void, { id: number; finance_period?: number }>({
      query: ({ id }) => ({
        url: `/income-entries/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { id: _id, finance_period }) => {
        const tags: Array<{ type: 'IncomeEntries'; id?: number } | 'IncomeEntries' | 'FinancePeriodSummary' | { type: 'FinancePeriodSummary'; id: number }> = [
          'IncomeEntries',
          'FinancePeriodSummary', // Always invalidate broad tag as fallback
        ]
        if (finance_period) {
          tags.push({ type: 'IncomeEntries', id: finance_period })
          tags.push({ type: 'FinancePeriodSummary', id: finance_period })
        }
        return tags
      },
    }),
  }),
})

export const {
  useListIncomeEntriesQuery,
  useGetIncomeEntryQuery,
  useCreateIncomeEntryMutation,
  useUpdateIncomeEntryMutation,
  useDeleteIncomeEntryMutation,
} = incomeEntriesApi

// Export types for convenience (only re-export from other modules to avoid duplicate export)
export type { IncomeEntry } from '@/entities/income-entry/model'

