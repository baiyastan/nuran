import { Suspense, useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAuthBootstrap } from '@/shared/hooks/useAuthBootstrap'
import { useAppDispatch } from '@/app/hooks'
import { logout } from '@/features/auth/authSlice'

function RequireAuth() {
  const { isAuthenticated, isLoadingMe, role } = useAuth()
  const { bootstrapping } = useAuthBootstrap()
  const dispatch = useAppDispatch()

  const invalidSession = isAuthenticated && !role

  useEffect(() => {
    if (invalidSession) dispatch(logout())
  }, [invalidSession, dispatch])

  if (bootstrapping || (isAuthenticated && isLoadingMe)) {
    return <div className="loading">Loading...</div>
  }

  if (!isAuthenticated || invalidSession) {
    return <Navigate to="/login" replace />
  }

  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <Outlet />
    </Suspense>
  )
}

export default RequireAuth
