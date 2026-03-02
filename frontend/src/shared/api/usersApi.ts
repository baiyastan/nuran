import { baseApi } from './baseApi'
import { User } from '@/entities/user/model'

export interface UserListResponse {
  count: number
  next: string | null
  previous: string | null
  results: User[]
}

export interface UpdateUserRoleRequest {
  role: 'admin' | 'director' | 'foreman'
}

export interface UserListParams {
  role?: 'admin' | 'director' | 'foreman'
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getUsers: builder.query<UserListResponse, UserListParams | void>({
      query: (params) => ({
        url: '/users/',
        params,
      }),
      providesTags: ['Users'],
    }),
    getForemen: builder.query<UserListResponse, void>({
      query: () => ({
        url: '/users/',
        params: { role: 'foreman' },
      }),
      providesTags: ['Users'],
    }),
    updateUserRole: builder.mutation<User, { userId: number; role: 'admin' | 'director' | 'foreman' }>({
      query: ({ userId, role }) => ({
        url: `/users/${userId}/role/`,
        method: 'PATCH',
        data: { role },
      }),
      invalidatesTags: ['Users'],
    }),
  }),
})

export const { useGetUsersQuery, useGetForemenQuery, useUpdateUserRoleMutation } = usersApi

