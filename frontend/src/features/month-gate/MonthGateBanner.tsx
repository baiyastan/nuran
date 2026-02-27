import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button/Button'
import './MonthGateBanner.css'

export function MonthGateBanner() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  const month = useMemo(() => {
    const fromUrl = searchParams.get('month')
    if (fromUrl && fromUrl.match(/^\d{4}-\d{2}$/)) {
      return fromUrl
    }
    return new Date().toISOString().slice(0, 7)
  }, [searchParams])

  const { data: monthPeriod, isLoading, error } = useGetMonthPeriodQuery(month)

  const handleManageMonths = () => {
    navigate(`/admin/months?month=${month}`)
  }

  if (isLoading) {
    return (
      <div className="month-gate-banner month-gate-banner--loading">
        <span>{t('monthGate.loading')}</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="month-gate-banner month-gate-banner--error">
        <span>{t('monthGate.error')}</span>
      </div>
    )
  }

  if (!monthPeriod) {
    return (
      <div className="month-gate-banner month-gate-banner--warning">
        <span>{t('monthGate.notOpened')}</span>
        {isAdmin ? (
          <Button type="button" onClick={handleManageMonths}>
            {t('monthGate.manageLink', { defaultValue: 'Manage months' })}
          </Button>
        ) : (
          <span>
            {t('monthGate.askAdminToOpen', {
              defaultValue: 'Ask admin to open the month.',
            })}
          </span>
        )}
      </div>
    )
  }

  if (monthPeriod.status === 'LOCKED') {
    return (
      <div className="month-gate-banner month-gate-banner--locked">
        <span>{t('monthGate.locked')}</span>
        <span>
          {t('monthGate.lockedPlanningInfo', {
            defaultValue: 'Planning is read-only; facts are still allowed.',
          })}
        </span>
        {isAdmin && (
          <Button type="button" onClick={handleManageMonths}>
            {t('monthGate.manageLink', { defaultValue: 'Manage months' })}
          </Button>
        )}
      </div>
    )
  }

  if (monthPeriod.status === 'OPEN') {
    return (
      <div className="month-gate-banner month-gate-banner--open">
        <span>{t('monthGate.open')}</span>
        {isAdmin && (
          <Button type="button" onClick={handleManageMonths}>
            {t('monthGate.manageLink', { defaultValue: 'Manage months' })}
          </Button>
        )}
      </div>
    )
  }

  return null
}

