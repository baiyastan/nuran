import { baseApi } from './baseApi'

export interface IncomeSource {
  id: number
  name: string
  is_active: boolean
}

export interface IncomeSourceListResponse {
  count: number
  next: string | null
  previous: string | null
  results: IncomeSource[]
}

export interface IncomeSourceListParams {
  is_active?: boolean | string
}

export interface CreateIncomeSourceRequest {
  name: string
  is_active: boolean
}

export interface UpdateIncomeSourceRequest {
  name?: string
  is_active?: boolean
}

export const incomeSourcesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    listIncomeSources: builder.query<IncomeSourceListResponse, IncomeSourceListParams | void>({
      query: (params) => {
        const searchParams: Record<string, string> = {}
        if (params?.is_active !== undefined) {
          searchParams.is_active = String(params.is_active)
        }
        return {
          url: '/income/sources/',
          params: Object.keys(searchParams).length > 0 ? searchParams : undefined,
        }
      },
      providesTags: ['IncomeSources'],
    }),
    createIncomeSource: builder.mutation<IncomeSource, CreateIncomeSourceRequest>({
      query: (data) => ({
        url: '/income/sources/',
        method: 'POST',
        data,
      }),
      invalidatesTags: ['IncomeSources'],
    }),
    updateIncomeSource: builder.mutation<IncomeSource, { id: number; data: UpdateIncomeSourceRequest }>({
      query: ({ id, data }) => ({
        url: `/income/sources/${id}/`,
        method: 'PATCH',
        data,
      }),
      invalidatesTags: ['IncomeSources'],
    }),
    deleteIncomeSource: builder.mutation<void, number>({
      query: (id) => ({
        url: `/income/sources/${id}/`,
        method: 'DELETE',
      }),
      invalidatesTags: ['IncomeSources'],
    }),
  }),
})

export const {
  useListIncomeSourcesQuery,
  useCreateIncomeSourceMutation,
  useUpdateIncomeSourceMutation,
  useDeleteIncomeSourceMutation,
} = incomeSourcesApi

