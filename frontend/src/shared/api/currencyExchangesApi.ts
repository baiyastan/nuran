import { baseApi } from './baseApi'
import type { CurrencyExchange } from '@/entities/currency-exchange/model'

export interface CurrencyExchangeListParams {
  month?: string // YYYY-MM
  source_account?: 'CASH' | 'BANK'
  source_currency?: 'KGS' | 'USD'
  destination_account?: 'CASH' | 'BANK'
  destination_currency?: 'KGS' | 'USD'
  ordering?: string
  page?: number
}

export interface CurrencyExchangeListResponse {
  count: number
  next: string | null
  previous: string | null
  results: CurrencyExchange[]
}

export interface CreateCurrencyExchangeRequest {
  source_account: 'CASH' | 'BANK'
  source_currency: 'KGS' | 'USD'
  source_amount: number
  destination_account: 'CASH' | 'BANK'
  destination_currency: 'KGS' | 'USD'
  destination_amount: number
  exchanged_at: string
  comment?: string
}

export type UpdateCurrencyExchangeRequest = Partial<CreateCurrencyExchangeRequest>

export const currencyExchangesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listCurrencyExchanges: builder.query<CurrencyExchangeListResponse, CurrencyExchangeListParams | void>({
      query: (params) => ({
        url: '/currency-exchanges/',
        params,
      }),
      providesTags: (result) =>
        result?.results
          ? [
              ...result.results.map((e) => ({ type: 'CurrencyExchanges' as const, id: e.id })),
              'CurrencyExchanges',
            ]
          : ['CurrencyExchanges'],
    }),
    createCurrencyExchange: builder.mutation<CurrencyExchange, CreateCurrencyExchangeRequest>({
      query: (body) => ({
        url: '/currency-exchanges/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['CurrencyExchanges', 'Report'],
    }),
    updateCurrencyExchange: builder.mutation<CurrencyExchange, { id: number; data: UpdateCurrencyExchangeRequest }>({
      query: ({ id, data }) => ({
        url: `/currency-exchanges/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'CurrencyExchanges', id },
        'CurrencyExchanges',
        'Report',
      ],
    }),
    deleteCurrencyExchange: builder.mutation<void, number>({
      query: (id) => ({
        url: `/currency-exchanges/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'CurrencyExchanges', id },
        'CurrencyExchanges',
        'Report',
      ],
    }),
  }),
})

export const {
  useListCurrencyExchangesQuery,
  useCreateCurrencyExchangeMutation,
  useUpdateCurrencyExchangeMutation,
  useDeleteCurrencyExchangeMutation,
} = currencyExchangesApi

export type { CurrencyExchange } from '@/entities/currency-exchange/model'
