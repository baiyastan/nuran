import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAppSelector } from '@/app/hooks'
import { selectMeStatus } from '@/features/auth/authSlice'
import Loader from '@/shared/ui/Loader/Loader'

export default function LandingRedirect() {
  const { role, isAuthenticated } = useAuth()
  const meStatus = useAppSelector(selectMeStatus)

  const isMeLoading = isAuthenticated && (meStatus === 'idle' || meStatus === 'loading')

  // Wait for auth bootstrap to complete before redirecting
  if (isMeLoading) {
    return <Loader />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (role === 'foreman') {
    return <Navigate to="/plan-setup" replace />
  }
  
  if (role === 'admin' || role === 'director') {
    return <Navigate to="/plan-setup" replace />
  }
  
  return <Navigate to="/plan-setup" replace />
}

