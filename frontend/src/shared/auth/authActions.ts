import { createAction } from '@reduxjs/toolkit'

/**
 * Neutral auth actions that don't import from baseApi or features/auth.
 * These can be safely imported by axiosBaseQuery without causing circular dependencies.
 */

/**
 * Set access token action.
 * Payload: access token string
 */
export const authSetAccessToken = createAction<string>('auth/setAccessToken')

/**
 * Logout action.
 * Clears auth state.
 */
export const authLogout = createAction('auth/logout')

