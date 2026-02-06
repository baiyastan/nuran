import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { useRefreshMutation, useMeQuery } from '@/shared/api/authApi'
import { setAccessToken } from '@/features/auth/authSlice'

/**
 * Hook to bootstrap authentication on protected routes.
 * Triggers /auth/me query automatically and handles refresh token on 401.
 */
export function useAuthBootstrap() {
  const dispatch = useDispatch()
  const [refreshToken] = useRefreshMutation()
  // Trigger me query automatically - RTK Query will handle the lifecycle
  const { error: meError, isError } = useMeQuery()

  useEffect(() => {
    // Handle refresh token on 401 error
    if (isError && meError) {
      const errorStatus = (meError as any)?.status || (meError as any)?.data?.status
      if (errorStatus === 401) {
        refreshToken()
          .unwrap()
          .then((result) => {
            if (result.access) {
              dispatch(setAccessToken(result.access))
              // Query will automatically retry after token is set
            }
          })
          .catch(() => {
            // Refresh failed - user will be logged out
            // This is expected if refresh token expired or user not logged in
            console.debug('Auth refresh failed')
          })
      }
    }
  }, [isError, meError, refreshToken, dispatch])
}

