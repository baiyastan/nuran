import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/shared/hooks/useAuth'
import { useMeQuery } from '@/shared/api/authApi'
import { Button } from '@/shared/ui/Button/Button'
import Loader from '@/shared/ui/Loader/Loader'
import './ErrorPage.css'

function ForbiddenPage() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const navigate = useNavigate()
  const { isLoading: isLoadingMe } = useMeQuery()

  const getHomePath = (role?: string): string => {
    if (role === 'foreman') return '/prorab/projects'
    return '/plan-periods'
  }

  // Auto-redirect after 1500ms when auth is loaded
  useEffect(() => {
    if (!isLoadingMe && role) {
      const timer = setTimeout(() => {
        navigate(getHomePath(role), { replace: true })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isLoadingMe, role, navigate])

  const handleGoHome = () => {
    navigate(getHomePath(role), { replace: true })
  }

  // Show loader while auth is still loading
  if (isLoadingMe) {
    return <Loader />
  }

  return (
    <div className="error-page">
      <div className="error-content">
        <h1>403</h1>
        <h2>{t('errors.accessForbidden')}</h2>
        <p>{t('errors.noPermission')}</p>
        {role && <p className="error-role">{t('errors.yourRole')} {role}</p>}
        <Button onClick={handleGoHome}>{t('common.goToHome')}</Button>
      </div>
    </div>
  )
}

export default ForbiddenPage



