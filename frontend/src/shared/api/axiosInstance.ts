import axios from 'axios'

/**
 * Shared axios instance singleton for API requests.
 *
 * Authorization:
 *   - RTK Query paths go through axiosBaseQuery.ts, which reads the token
 *     from the Redux auth slice and sets `Authorization: Bearer ...` per
 *     request (single source of truth).
 *   - Direct-axios paths (e.g. `entities/*\/api.ts`) hit the request
 *     interceptor below, which falls back to the token persisted by
 *     `authSlice` in localStorage. RTK-Query-supplied headers win because
 *     the interceptor only fills in Authorization when it's missing.
 */
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for HttpOnly cookies
})

axiosInstance.interceptors.request.use((config) => {
  const hasAuth = Boolean(config.headers?.get?.('Authorization') ?? (config.headers as Record<string, unknown> | undefined)?.Authorization)
  if (!hasAuth) {
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('accessToken') : null
      if (token) {
        config.headers = config.headers ?? {}
        ;(config.headers as Record<string, unknown>).Authorization = `Bearer ${token}`
      }
    } catch {
      // localStorage unavailable (SSR, privacy mode) — send the request without Authorization
    }
  }
  return config
})
