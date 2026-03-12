import { useMemo } from 'react'
import { useAppSelector } from '@/app/hooks'
import { useMeQuery } from '@/shared/api/authApi'
import { selectAccessToken, selectUser, selectMeStatus } from '@/features/auth/authSlice'

/**
 * Hook to bootstrap authentication on protected routes.
 * Triggers /auth/me query automatically when a token exists but user is not loaded yet.
 * Returns bootstrapping status to indicate when auth state is being restored.
 */
export function useAuthBootstrap() {
  const accessToken = useAppSelector(selectAccessToken)
  const user = useAppSelector(selectUser)
  const meStatus = useAppSelector(selectMeStatus)

  // Only run /me query if we have a token but no user (bootstrap scenario)
  // Skip if user already exists (avoid unnecessary calls)
  useMeQuery(undefined, {
    skip: !accessToken || !!user,
    refetchOnMountOrArgChange: false,
  })

  const bootstrapping = useMemo(() => {
    // We are bootstrapping only while we have a token but no user yet,
    // and the /auth/me/ query is still in idle/loading state.
    return !!accessToken && !user && (meStatus === 'idle' || meStatus === 'loading')
  }, [accessToken, user, meStatus])

  return { bootstrapping }
}
