import { baseApi } from './baseApi'
import type { Transfer } from '@/entities/transfer/model'

export interface TransferListParams {
  source_account?: 'CASH' | 'BANK'
  destination_account?: 'CASH' | 'BANK'
  month?: string // YYYY-MM to filter by transferred_at
  ordering?: string
  page?: number
}

export interface TransferListResponse {
  count: number
  next: string | null
  previous: string | null
  results: Transfer[]
}

export interface CreateTransferRequest {
  source_account: 'CASH' | 'BANK'
  destination_account: 'CASH' | 'BANK'
  currency: 'KGS' | 'USD'
  amount: number
  transferred_at: string
  comment?: string
}

export interface UpdateTransferRequest {
  source_account?: 'CASH' | 'BANK'
  destination_account?: 'CASH' | 'BANK'
  currency?: 'KGS' | 'USD'
  amount?: number
  transferred_at?: string
  comment?: string
}

export const transfersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listTransfers: builder.query<TransferListResponse, TransferListParams | void>({
      query: (params) => ({
        url: '/transfers/',
        params,
      }),
      providesTags: (result) =>
        result?.results
          ? [
              ...result.results.map((t) => ({ type: 'Transfers' as const, id: t.id })),
              'Transfers',
            ]
          : ['Transfers'],
    }),
    getTransfer: builder.query<Transfer, number>({
      query: (id) => ({ url: `/transfers/${id}/` }),
      providesTags: (_result, _error, id) => [{ type: 'Transfers', id }, 'Transfers'],
    }),
    createTransfer: builder.mutation<Transfer, CreateTransferRequest>({
      query: (body) => ({
        url: '/transfers/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['Transfers', 'Report'],
    }),
    updateTransfer: builder.mutation<Transfer, { id: number; data: UpdateTransferRequest }>({
      query: ({ id, data }) => ({
        url: `/transfers/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Transfers', id }, 'Transfers', 'Report'],
    }),
    deleteTransfer: builder.mutation<void, number>({
      query: (id) => ({
        url: `/transfers/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Transfers', id }, 'Transfers', 'Report'],
    }),
  }),
})

export const {
  useListTransfersQuery,
  useGetTransferQuery,
  useCreateTransferMutation,
  useUpdateTransferMutation,
  useDeleteTransferMutation,
} = transfersApi

export type { Transfer } from '@/entities/transfer/model'
