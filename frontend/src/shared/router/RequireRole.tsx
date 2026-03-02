import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '@/app/hooks'
import { useAuth } from '@/shared/hooks/useAuth'
import { selectMeStatus } from '@/features/auth/authSlice'
import Loader from '@/shared/ui/Loader/Loader'

interface RequireRoleProps {
  allowedRoles: string[]
}

function RequireRole({ allowedRoles }: RequireRoleProps) {
  const { isAuthenticated, accessToken, user } = useAuth()
  const meStatus = useAppSelector(selectMeStatus)

  // Show loader while loading or if we have token but haven't started query yet
  if (meStatus === 'loading' || (meStatus === 'idle' && accessToken)) {
    return <Loader />
  }

  // Redirect to login if not authenticated or me query failed
  if (!isAuthenticated || meStatus === 'failed') {
    return <Navigate to="/login" replace />
  }

  // Check role only after user is loaded
  if (!user || !user.role || !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />
  }

  return <Outlet />
}

export default RequireRole



