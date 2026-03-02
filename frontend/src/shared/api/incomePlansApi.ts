import { baseApi } from './baseApi'

export interface IncomePlan {
  id: number
  year: number
  month: number
  source: {
    id: number
    name: string
    is_active: boolean
  }
  source_id: number
  amount: string
  created_at: string
  updated_at: string
}

export interface IncomePlansSummaryParams {
  year: number
  month: number
}

export interface IncomePlansSummaryResponse {
  period: {
    year: number
    month: number
    status: string | null  // "open", "closed", "locked", or null
  } | null
  summary: {
    total_amount: string
    items_count: number
  }
  results: IncomePlan[]
  count?: number
  next?: string | null
  previous?: string | null
}

export interface CreateIncomePlanRequest {
  year: number
  month: number
  source_id: number
  amount: number
}

export interface UpdateIncomePlanRequest {
  source_id?: number
  amount?: number
}

export const incomePlansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getIncomePlansSummary: builder.query<IncomePlansSummaryResponse, IncomePlansSummaryParams>({
      query: ({ year, month }) => ({
        url: '/income/plans/',
        params: { year, month },
      }),
      providesTags: (_result, _error, { year, month }) => [
        { type: 'IncomePlans', id: `${year}-${month}` },
        'IncomePlans',
      ],
    }),
    createIncomePlan: builder.mutation<IncomePlan, CreateIncomePlanRequest>({
      query: (body) => ({
        url: '/income/plans/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: (_result, _error, { year, month }) => [
        { type: 'IncomePlans', id: `${year}-${month}` },
        'IncomePlans',
        'IncomeSources', // Invalidate to refresh source dropdown
        'FinancePeriodSummary', // Invalidate all summaries since IncomePlans affect office FinancePeriods
        'FinancePeriods',
      ],
    }),
    updateIncomePlan: builder.mutation<IncomePlan, { id: number; data: UpdateIncomePlanRequest }>({
      query: ({ id, data }) => ({
        url: `/income/plans/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, _error, { id: _id }) => {
        const tags: Array<{ type: 'IncomePlans'; id: string } | 'IncomePlans' | 'IncomeSources' | 'FinancePeriodSummary' | 'FinancePeriods'> = [
          'IncomePlans',
          'IncomeSources', // Invalidate to refresh source dropdown
          'FinancePeriodSummary',
          'FinancePeriods',
        ]
        if (result?.year !== undefined && result?.month !== undefined) {
          tags.push({ type: 'IncomePlans', id: `${result.year}-${result.month}` })
        }
        return tags
      },
    }),
    deleteIncomePlan: builder.mutation<void, { id: number; year?: number; month?: number }>({
      query: ({ id }) => ({
        url: `/income/plans/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { year, month }) => {
        const tags: Array<{ type: 'IncomePlans'; id: string } | 'IncomePlans' | 'IncomeSources' | 'FinancePeriodSummary' | 'FinancePeriods'> = [
          'IncomePlans',
          'IncomeSources', // Invalidate to refresh source dropdown
          'FinancePeriodSummary',
          'FinancePeriods',
        ]
        if (year !== undefined && month !== undefined) {
          tags.push({ type: 'IncomePlans', id: `${year}-${month}` })
        }
        return tags
      },
    }),
  }),
})

export const {
  useGetIncomePlansSummaryQuery,
  useCreateIncomePlanMutation,
  useUpdateIncomePlanMutation,
  useDeleteIncomePlanMutation,
} = incomePlansApi



