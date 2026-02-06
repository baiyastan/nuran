import { Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { useMeQuery } from '@/shared/api/authApi'
import Loader from '@/shared/ui/Loader/Loader'

export default function LandingRedirect() {
  const { role } = useAuth()
  const { isLoading: isLoadingMe } = useMeQuery()
  
  // Wait for auth/me to load before redirecting
  if (isLoadingMe) {
    return <Loader />
  }
  
  if (role === 'foreman') {
    return <Navigate to="/prorab/projects" replace />
  }
  
  if (role === 'admin' || role === 'director') {
    return <Navigate to="/projects" replace />
  }
  
  return <Navigate to="/plan-periods" replace />
}

