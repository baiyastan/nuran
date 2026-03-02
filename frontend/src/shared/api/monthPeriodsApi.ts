import { baseApi } from './baseApi'

export interface MonthPeriod {
  id: number
  month: string // YYYY-MM format
  status: 'OPEN' | 'LOCKED'
  created_at: string
  updated_at: string
}

export interface MonthPeriodListResponse {
  count: number
  next: string | null
  previous: string | null
  results: MonthPeriod[]
}

export const monthPeriodsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMonthPeriod: builder.query<MonthPeriod | null, string>({
      query: (month) => ({
        url: '/budgets/month-periods/',
        params: { month },
      }),
      transformResponse: (response: MonthPeriodListResponse, _meta: unknown, _arg: string) => {
        // API returns a list, but we want a single item
        if (response.results && response.results.length > 0) {
          return response.results[0]
        }
        return null // Return null if not found (treated as LOCKED)
      },
      providesTags: (_result, _error, month) => [{ type: 'MonthPeriods', id: month }],
    }),
    listMonthPeriods: builder.query<MonthPeriodListResponse, void>({
      query: () => ({
        url: '/budgets/month-periods/',
      }),
      providesTags: ['MonthPeriods'],
    }),
    createMonthPeriod: builder.mutation<MonthPeriod, { month: string }>({
      query: (body) => ({
        url: '/budgets/month-periods/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['MonthPeriods'],
    }),
    openMonthPeriod: builder.mutation<MonthPeriod, number>({
      query: (id) => ({
        url: `/budgets/month-periods/${id}/open/`,
        method: 'POST',
      }),
      invalidatesTags: (result, _error, _id) => [
        { type: 'MonthPeriods', id: result?.month },
        'MonthPeriods',
      ],
    }),
    lockMonthPeriod: builder.mutation<MonthPeriod, number>({
      query: (id) => ({
        url: `/budgets/month-periods/${id}/lock/`,
        method: 'POST',
      }),
      invalidatesTags: (result, _error, _id) => [
        { type: 'MonthPeriods', id: result?.month },
        'MonthPeriods',
      ],
    }),
    unlockMonthPeriod: builder.mutation<MonthPeriod, number>({
      query: (id) => ({
        url: `/budgets/month-periods/${id}/unlock/`,
        method: 'POST',
      }),
      invalidatesTags: (result, _error, _id) => [
        { type: 'MonthPeriods', id: result?.month },
        'MonthPeriods',
      ],
    }),
  }),
})

export const {
  useGetMonthPeriodQuery,
  useListMonthPeriodsQuery,
  useCreateMonthPeriodMutation,
  useOpenMonthPeriodMutation,
  useLockMonthPeriodMutation,
  useUnlockMonthPeriodMutation,
} = monthPeriodsApi
