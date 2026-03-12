import { Suspense, useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAuthBootstrap } from '@/shared/hooks/useAuthBootstrap'
import { useAppDispatch } from '@/app/hooks'
import { logout } from '@/features/auth/authSlice'
import { baseApi } from '@/shared/api/baseApi'
import { LoadingScreen } from '@/components/ui/LoadingScreen'

function RequireAuth() {
  const { isAuthenticated, isLoadingMe, role } = useAuth()
  const { bootstrapping } = useAuthBootstrap()
  const dispatch = useAppDispatch()

  const invalidSession = isAuthenticated && !role

  useEffect(() => {
    if (invalidSession) {
      dispatch(logout())
      dispatch(baseApi.util.resetApiState())
    }
  }, [invalidSession, dispatch])

  if (bootstrapping || (isAuthenticated && isLoadingMe)) {
    return <LoadingScreen />
  }

  if (!isAuthenticated || invalidSession) {
    return <Navigate to="/login" replace />
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Outlet />
    </Suspense>
  )
}

export default RequireAuth
