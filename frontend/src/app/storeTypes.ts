/**
 * Type definitions for Redux store state.
 * 
 * This file contains only type definitions and does not import from store.ts,
 * preventing circular dependencies when used in API layer.
 */

/**
 * Minimal type definition for Redux state structure.
 * Only includes what baseQuery needs to access auth state.
 */
export interface RootStateLike {
  auth: {
    accessToken: string | null
  }
}

