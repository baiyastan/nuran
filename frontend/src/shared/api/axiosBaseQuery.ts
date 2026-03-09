import type { BaseQueryFn } from '@reduxjs/toolkit/query'
import axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import type { RootStateLike } from '@/app/storeTypes'
import { axiosInstance } from './axiosInstance'
import { authSetAccessToken, authLogout } from '@/shared/auth/authActions'

/** Error shape compatible with RTK Query BaseQueryFn error result */
export interface ApiError {
  status?: number
  data?: unknown
  error?: string
}

export interface AxiosBaseQueryError extends ApiError {}

// Track refresh attempts to prevent infinite loops
let isRefreshing = false
let failedQueue: Array<{
  resolve: (value?: unknown) => void
  reject: (reason?: unknown) => void
}> = []

/**
 * Check if an error response indicates a retryable error.
 * Handles rate limiting (429), service unavailable (503), and custom retryable errors.
 */
const isRetryableError = (error: AxiosError): boolean => {
  const status = error.response?.status
  const data = error.response?.data as { isRetryable?: boolean; error?: string } | undefined

  // Check HTTP status codes for retryable errors
  if (status === 429 || status === 503 || status === 502) {
    return true
  }

  // Check for custom retryable error format (e.g., ERROR_RESOURCE_EXHAUSTED)
  if (data?.isRetryable === true || data?.error === 'ERROR_RESOURCE_EXHAUSTED') {
    return true
  }

  return false
}

/**
 * Calculate delay for exponential backoff retry.
 * @param attempt - Current retry attempt (0-indexed)
 * @param baseDelay - Base delay in milliseconds (default: 1000ms)
 * @param maxDelay - Maximum delay in milliseconds (default: 10000ms)
 */
const calculateRetryDelay = (attempt: number, baseDelay: number = 1000, maxDelay: number = 10000): number => {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay
  return delay + jitter
}

/**
 * Sleep utility for retry delays.
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error != null) {
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
      responseType?: AxiosRequestConfig['responseType']
    },
    unknown,
    AxiosBaseQueryError
  > =>
  async ({ url, method = 'GET', data, params, headers, responseType }, api) => {
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
        responseType,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...headers,
        },
      })
    }

    try {
      // Get access token from Redux state using api.getState()
      const state = api.getState() as RootStateLike
      const token = state.auth.accessToken

      // Use shared axios instance and attach Authorization header per request
      const result = await makeRequest(token)

      return { data: result.data }
    } catch (axiosError: unknown) {
      if (!axios.isAxiosError(axiosError)) {
        return {
          error: {
            status: 500,
            data: axiosError,
            error: 'Unknown error',
          },
        }
      }
      const err = axiosError

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
                .catch((retryErr: unknown) => {
                  if (!axios.isAxiosError(retryErr)) {
                    return {
                      error: {
                        status: 500,
                        data: retryErr,
                        error: 'Unknown error',
                      },
                    }
                  }
                  return {
                    error: {
                      status: retryErr.response?.status,
                      data: retryErr.response?.data || retryErr.message,
                      error: retryErr.message,
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
        } catch (refreshError: unknown) {
          processQueue(refreshError, null)
          api.dispatch(authLogout())

          return {
            error: {
              status: 401,
              data: axios.isAxiosError(refreshError)
                ? refreshError.response?.data || refreshError.message
                : refreshError,
              error: 'Authentication failed - refresh token expired',
            },
          }
        } finally {
          isRefreshing = false
        }
      }

      // Handle retryable errors (rate limiting, resource exhaustion, etc.)
      if (isRetryableError(err) && !shouldSkipRefresh) {
        const maxRetries = 3
        let lastError = err

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          // Calculate delay with exponential backoff
          const delay = calculateRetryDelay(attempt)
          await sleep(delay)

          try {
            // Retry the original request
            const state = api.getState() as RootStateLike
            const token = state.auth.accessToken
            const retryResult = await makeRequest(token)
            return { data: retryResult.data }
          } catch (retryError: unknown) {
            const retryErr = axios.isAxiosError(retryError) ? retryError : err
            lastError = retryErr

            // If it's no longer retryable, break the retry loop
            if (!isRetryableError(retryErr)) {
              break
            }
          }
        }

        // All retries exhausted, return the last error
        return {
          error: {
            status: lastError.response?.status,
            data: lastError.response?.data || lastError.message,
            error: lastError.message,
          },
        }
      }

      // Return error for non-401, non-retryable errors or auth endpoint errors
      return {
        error: {
          status: err.response?.status,
          data: err.response?.data || err.message,
          error: err.message,
        },
      }
    }
  }

