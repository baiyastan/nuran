import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import type { RootStateLike } from '@/app/storeTypes'
import { axiosInstance } from './axiosInstance'
import { authSetAccessToken, authLogout } from '@/shared/auth/authActions'

export interface AxiosBaseQueryError {
  status?: number
  data?: unknown
  error?: string
}

// Track refresh attempts to prevent infinite loops
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

const processQueue = (error: AxiosError | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

export const axiosBaseQuery =
  (): BaseQueryFn<
    {
      url: string
      method?: AxiosRequestConfig['method']
      data?: AxiosRequestConfig['data']
      params?: AxiosRequestConfig['params']
      headers?: AxiosRequestConfig['headers']
    },
    unknown,
    AxiosBaseQueryError
  > =>
  async ({ url, method = 'GET', data, params, headers }, api) => {
    // Defensive fallback for url
    const requestUrl = url ?? ''
    
    // Early return error if url is missing
    if (!requestUrl) {
      return {
        error: {
          status: 400,
          data: 'Missing URL in request',
          error: 'Invalid request configuration',
        },
      }
    }
    
    // Skip refresh retry for auth endpoints to prevent infinite loops
    const authEndpoints = ['/auth/refresh/', '/auth/login/', '/auth/register/', '/auth/me/']
    const shouldSkipRefresh = authEndpoints.some(endpoint => 
      typeof requestUrl === 'string' && requestUrl.startsWith(endpoint)
    )
    
    const makeRequest = async (token: string | null) => {
      return axiosInstance({
        url: requestUrl,
        method,
        data,
        params,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...headers,
        },
      })
    }

    try {
      // Get access token from Redux state using api.getState()
      const state = api.getState() as RootStateLike
      let token = state.auth.accessToken

      // Use shared axios instance and attach Authorization header per request
      const result = await makeRequest(token)

      return { data: result.data }
    } catch (axiosError) {
      const err = axiosError as AxiosError

      // Handle 401 errors with refresh retry (except for auth endpoints)
      if (err.response?.status === 401 && !shouldSkipRefresh) {
        // If refresh is already in progress, queue this request
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          })
            .then((newToken) => {
              return makeRequest(newToken as string | null)
                .then((result) => ({ data: result.data }))
                .catch((retryErr) => {
                  const retryError = retryErr as AxiosError
                  return {
                    error: {
                      status: retryError.response?.status,
                      data: retryError.response?.data || retryError.message,
                      error: retryError.message,
                    },
                  }
                })
            })
            .catch((queueErr) => {
              return {
                error: {
                  status: 401,
                  data: queueErr,
                  error: 'Authentication failed',
                },
              }
            })
        }

        // Start refresh process
        isRefreshing = true

        try {
          // Call POST /auth/refresh (cookie-based, no body)
          const refreshResponse = await axiosInstance({
            url: '/auth/refresh/',
            method: 'POST',
            // No body - refresh token is in HttpOnly cookie
          })

          const { access } = refreshResponse.data

          // Update access token in Redux state (using shared action to avoid circular dependency)
          api.dispatch(authSetAccessToken(access))

          // Process queued requests
          processQueue(null, access)

          // Retry original request with new token
          const retryResult = await makeRequest(access)
          return { data: retryResult.data }
        } catch (refreshError) {
          // Refresh failed - clear auth state and process queue with error
          const refreshErr = refreshError as AxiosError
          processQueue(refreshErr, null)
          api.dispatch(authLogout())

          return {
            error: {
              status: 401,
              data: refreshErr.response?.data || refreshErr.message,
              error: 'Authentication failed - refresh token expired',
            },
          }
        } finally {
          isRefreshing = false
        }
      }

      // Return error for non-401 errors or auth endpoint errors
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data || err.message,
          error: err.message,
        },
      }
    }
  }

