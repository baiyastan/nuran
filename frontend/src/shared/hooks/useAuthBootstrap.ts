import { useEffect, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { useAppSelector } from '@/app/hooks'
import { useRefreshMutation, useMeQuery } from '@/shared/api/authApi'
import { setAccessToken, selectAccessToken, selectUser } from '@/features/auth/authSlice'

/**
 * Hook to bootstrap authentication on protected routes.
 * Triggers /auth/me query automatically and handles refresh token on 401.
 * Returns bootstrapping status to indicate when auth state is being restored.
 */
export function useAuthBootstrap() {
  const dispatch = useDispatch()
  const accessToken = useAppSelector(selectAccessToken)
  const user = useAppSelector(selectUser)
  const [refreshToken, { isLoading: isRefreshing }] = useRefreshMutation()

  // Only run /me query if we have a token but no user (bootstrap scenario)
  // Skip if user already exists (avoid unnecessary calls)
  const { error: meError, isError } = useMeQuery(undefined, {
    skip: !accessToken || !!user,
    refetchOnMountOrArgChange: false,
  })

  // Calculate bootstrapping status:
  // - true if we have a token but no user (initial bootstrap state)
  // - true if refresh token mutation is in progress
  const bootstrapping = useMemo(() => {
    return (!!accessToken && !user) || isRefreshing
  }, [accessToken, user, isRefreshing])

  useEffect(() => {
    // Handle refresh token on 401 error
    if (isError && meError) {
      let errorStatus: number | undefined
      if (typeof meError === 'object' && meError !== null) {
        const err = meError as Record<string, unknown>
        if (typeof err.status === 'number') {
          errorStatus = err.status
        } else if (err.data && typeof err.data === 'object' && err.data !== null) {
          const data = err.data as Record<string, unknown>
          if (typeof data.status === 'number') {
            errorStatus = data.status
          }
        }
      }
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

  return { bootstrapping }
}
