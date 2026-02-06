import { useAppSelector } from '@/app/hooks'
import { selectUser, selectRole, selectAccessToken, selectMeStatus } from '@/features/auth/authSlice'

export function useAuth() {
  const user = useAppSelector(selectUser)
  const role = useAppSelector(selectRole)
  const accessToken = useAppSelector(selectAccessToken)
  const meStatus = useAppSelector(selectMeStatus)
  
  return {
    user,
    role,
    accessToken,
    isAuthenticated: !!accessToken && !!user,
    meStatus,
    isLoadingMe: meStatus === 'loading',
  }
}
