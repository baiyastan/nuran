import { Suspense } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAuthBootstrap } from '@/shared/hooks/useAuthBootstrap'
import { useMeQuery } from '@/shared/api/authApi'

function RequireAuth() {
  const { isAuthenticated } = useAuth()
  
  // Trigger me query early to ensure it starts as soon as RequireAuth mounts
  useMeQuery()
  
  // Bootstrap auth only on protected routes (handles refresh token logic)
  useAuthBootstrap()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <Outlet />
    </Suspense>
  )
}

export default RequireAuth



