import { baseApi } from './baseApi'

export interface MonthPeriod {
  id: number
  month: string // YYYY-MM format
  status: 'OPEN' | 'LOCKED'
  created_at: string
  updated_at: string
}

export interface MonthPeriodListParams {
  month?: string
  status?: string
  page?: number
}

export interface MonthPeriodListResponse {
  count: number
  next: string | null
  previous: string | null
  results: MonthPeriod[]
}

export const monthPeriodsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listMonthPeriods: builder.query<MonthPeriodListResponse, MonthPeriodListParams | void>({
      query: (params) => ({
        url: '/budgets/month-periods/',
        params,
      }),
      providesTags: ['MonthPeriods'],
    }),
    getMonthPeriod: builder.query<MonthPeriod, string>({
      query: (month) => ({ url: `/budgets/month-periods/${month}/` }),
      providesTags: (result, error, month) => [{ type: 'MonthPeriods', id: month }],
    }),
    createMonthPeriod: builder.mutation<MonthPeriod, { month: string; status?: 'OPEN' | 'LOCKED' }>({
      query: (body) => ({
        url: '/budgets/month-periods/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['MonthPeriods'],
    }),
    updateMonthPeriod: builder.mutation<MonthPeriod, { month: string; status: 'OPEN' | 'LOCKED' }>({
      query: ({ month, ...data }) => ({
        url: `/budgets/month-periods/${month}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (result, error, { month }) => [{ type: 'MonthPeriods', id: month }, 'MonthPeriods'],
    }),
    unlockMonthPeriod: builder.mutation<MonthPeriod, string>({
      query: (month) => ({
        url: `/budgets/month-periods/${month}/unlock/`,
        method: 'PATCH',
      }),
      invalidatesTags: (result, error, month) => [{ type: 'MonthPeriods', id: month }, 'MonthPeriods'],
    }),
    lockMonthPeriod: builder.mutation<MonthPeriod, string>({
      query: (month) => ({
        url: `/budgets/month-periods/${month}/lock/`,
        method: 'PATCH',
      }),
      invalidatesTags: (result, error, month) => [{ type: 'MonthPeriods', id: month }, 'MonthPeriods'],
    }),
  }),
})

export const {
  useListMonthPeriodsQuery,
  useGetMonthPeriodQuery,
  useCreateMonthPeriodMutation,
  useUpdateMonthPeriodMutation,
  useUnlockMonthPeriodMutation,
  useLockMonthPeriodMutation,
} = monthPeriodsApi


