import axios from 'axios'

/**
 * Shared axios instance singleton for API requests.
 * Configured with baseURL, timeout, credentials, and default headers.
 * 
 * Note: Authorization header is handled by axiosBaseQuery.ts, not here.
 * This ensures single source of truth for token management via Redux state.
 */
export const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE ?? import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for HttpOnly cookies
})

