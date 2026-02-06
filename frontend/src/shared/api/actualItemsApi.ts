import { baseApi } from './baseApi'
import { ActualItem } from '@/entities/actual-item/model'

export interface ActualItemListParams {
  plan_period?: number
  category?: string
  search?: string
  ordering?: string
  page?: number
}

export interface ActualItemListResponse {
  count: number
  next: string | null
  previous: string | null
  results: ActualItem[]
}

export const actualItemsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listActualItems: builder.query<ActualItemListResponse, ActualItemListParams | void>({
      query: (params) => ({
        url: '/actual-items/',
        params,
      }),
      providesTags: ['ActualItems'],
    }),
    createActualItem: builder.mutation<ActualItem, Partial<ActualItem>>({
      query: (body) => ({
        url: '/actual-items/',
        method: 'POST',
        data: body,
      }),
      invalidatesTags: ['ActualItems'],
    }),
  }),
})

export const {
  useListActualItemsQuery,
  useCreateActualItemMutation,
} = actualItemsApi

