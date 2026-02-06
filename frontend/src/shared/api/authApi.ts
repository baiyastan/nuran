import { baseApi } from './baseApi'
import { User } from '@/entities/user/model'

export interface LoginResponse {
  access: string
  user: User
}

export interface RegisterRequest {
  email: string
  password: string
  password_confirm: string
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, { email: string; password: string }>({
      query: (credentials) => ({
        url: '/auth/login/',
        method: 'POST',
        data: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
    register: builder.mutation<LoginResponse, RegisterRequest>({
      query: (credentials) => ({
        url: '/auth/register/',
        method: 'POST',
        data: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
    me: builder.query<User, void>({
      query: () => ({ url: '/auth/me/' }),
      providesTags: ['Auth'],
    }),
    refresh: builder.mutation<{ access: string }, void>({
      query: () => ({
        url: '/auth/refresh/',
        method: 'POST',
        // No body - refresh token is in HttpOnly cookie
      }),
    }),
    logout: builder.mutation<{ detail: string }, void>({
      query: () => ({
        url: '/auth/logout/',
        method: 'POST',
      }),
      invalidatesTags: ['Auth'],
    }),
  }),
})

export const { useLoginMutation, useRegisterMutation, useMeQuery, useRefreshMutation, useLogoutMutation } = authApi
