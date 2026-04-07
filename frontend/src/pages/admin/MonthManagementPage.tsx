import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { MonthSelector } from '@/pages/reports/components/MonthSelector'
import {
  useGetMonthPeriodQuery,
  useCreateMonthPeriodMutation,
  useLockMonthPeriodMutation,
  useUnlockMonthPeriodMutation,
  useOpenPlanningMutation,
  useClosePlanningMutation,
} from '@/shared/api/monthPeriodsApi'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { getErrorMessage } from '@/shared/lib/utils'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { Button } from '@/shared/ui/Button/Button'
import './MonthManagementPage.css'

function MonthManagementPage() {
  const { t } = useTranslation('monthManagement')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const { showSuccess, showError } = useToastContext()
  const [searchParams, setSearchParams] = useSearchParams()

  // Initial month comes from ?month=YYYY-MM query (or falls back to current month).
  // This value is preserved when navigating here from MonthGateBanner's "Manage months" link.
  const initialMonth = useMemo(() => {
    const fromUrl = searchParams.get('month')
    if (fromUrl && fromUrl.match(/^\d{4}-\d{2}$/)) {
      return fromUrl
    }
    return new Date().toISOString().slice(0, 7)
  }, [searchParams])

  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth)

  const { data: monthPeriod, isLoading, error, refetch } = useGetMonthPeriodQuery(selectedMonth)
  const [createMonthPeriod, { isLoading: isCreating }] = useCreateMonthPeriodMutation()
  const [lockMonthPeriod, { isLoading: isLocking }] = useLockMonthPeriodMutation()
  const [unlockMonthPeriod, { isLoading: isUnlocking }] = useUnlockMonthPeriodMutation()
  const [openPlanning, { isLoading: isOpeningPlanning }] = useOpenPlanningMutation()
  const [closePlanning, { isLoading: isClosingPlanning }] = useClosePlanningMutation()

  const normalizedStatus: 'NOT_CREATED' | 'OPEN' | 'LOCKED' = useMemo(() => {
    if (!monthPeriod) return 'NOT_CREATED'
    if (monthPeriod.status === 'OPEN') return 'OPEN'
    if (monthPeriod.status === 'LOCKED') return 'LOCKED'
    return 'NOT_CREATED'
  }, [monthPeriod])

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month)
    const next = new URLSearchParams(searchParams)
    next.set('month', month)
    setSearchParams(next, { replace: true })
  }

  const handleOpenMonth = async () => {
    const isUnlockingExistingLockedMonth = !!monthPeriod && monthPeriod.status === 'LOCKED'

    try {
      if (!monthPeriod) {
        await createMonthPeriod({ month: selectedMonth }).unwrap()
      } else if (monthPeriod.status === 'LOCKED') {
        await unlockMonthPeriod(monthPeriod.id).unwrap()
      }
      await refetch()
      if (isUnlockingExistingLockedMonth) {
        showSuccess(t('toast.unlockSuccess'))
      } else {
        showSuccess(t('toast.openSuccess'))
      }
    } catch (err: unknown) {
      if (isUnlockingExistingLockedMonth) {
        showError(t('toast.unlockError'))
      } else {
        showError(t('toast.openError'))
      }
    }
  }

  const handleLockMonth = async () => {
    if (!monthPeriod) return
    try {
      await lockMonthPeriod(monthPeriod.id).unwrap()
      await refetch()
      showSuccess(t('toast.lockSuccess'))
    } catch (err: unknown) {
      showError(t('toast.lockError'))
    }
  }

  const handleOpenPlanning = async () => {
    if (!monthPeriod || monthPeriod.status !== 'OPEN') return
    try {
      await openPlanning(monthPeriod.id).unwrap()
      await refetch()
      showSuccess('Planning opened')
    } catch {
      showError('Failed to open planning')
    }
  }

  const handleClosePlanning = async () => {
    if (!monthPeriod || monthPeriod.status !== 'OPEN') return
    try {
      await closePlanning(monthPeriod.id).unwrap()
      await refetch()
      showSuccess('Planning closed')
    } catch {
      showError('Failed to close planning')
    }
  }

  const goBack = () => {
    navigate(-1)
  }

  const isMutating = isCreating || isLocking || isUnlocking || isOpeningPlanning || isClosingPlanning

  const formattedMonth = selectedMonth

  const loadErrorText = useMemo(() => {
    if (!error) return null
    return getErrorMessage(error)
  }, [error])

  return (
    <div className="month-management-container">
      <div className="month-management-page">
        <div className="month-management-header">
          <div>
            <h1>{t('title')}</h1>
            <p className="help-text">{t('helpText')}</p>
          </div>
          <Button variant="secondary" onClick={goBack}>
            {tCommon('back')}
          </Button>
        </div>

        <div className="month-management-selector">
          <MonthSelector
            value={selectedMonth}
            onChange={handleMonthChange}
            monthStatus={monthPeriod?.status ?? null}
          />
        </div>

        <div className="month-management-content">
          {isLoading ? (
            <LoadingScreen compact />
          ) : error ? (
            <div className="error">
              {t('loadError')}
              {loadErrorText && <div className="error-detail">{loadErrorText}</div>}
            </div>
          ) : (
            <div className="month-card">
              <div className="month-card-header">
                <h2 className="month-card-title">{formattedMonth}</h2>
                <span
                  className={
                    normalizedStatus === 'NOT_CREATED'
                      ? 'month-status-badge month-status-badge--not-created'
                      : normalizedStatus === 'OPEN'
                      ? 'month-status-badge month-status-badge--open'
                      : 'month-status-badge month-status-badge--locked'
                  }
                >
                  {normalizedStatus === 'NOT_CREATED'
                    ? t('status.notCreated')
                    : normalizedStatus === 'OPEN'
                    ? tCommon('status.OPEN')
                    : tCommon('status.LOCKED')}
                </span>
              </div>

              <div className="month-card-body">
                <p className="month-status-description">
                  {normalizedStatus === 'NOT_CREATED'
                    ? t('desc.notOpened')
                    : normalizedStatus === 'OPEN'
                    ? t('desc.open')
                    : t('desc.locked')}
                </p>

                {monthPeriod && (
                  <div className="planning-status-row">
                    <span className="planning-status-label">{t('planning.open')}</span>
                    <span
                      className={
                        monthPeriod.planning_open
                          ? 'planning-status-badge planning-status-badge--open'
                          : 'planning-status-badge planning-status-badge--closed'
                      }
                    >
                      {monthPeriod.planning_open ? t('planning.open') : t('planning.closed')}
                    </span>
                  </div>
                )}

                <div className="month-actions">
                  {normalizedStatus === 'NOT_CREATED' && (
                    <Button onClick={handleOpenMonth} disabled={isMutating}>
                      {isCreating ? t('actions.opening') : t('actions.open')}
                    </Button>
                  )}
                  {normalizedStatus === 'OPEN' && (
                    <Button
                      onClick={handleLockMonth}
                      disabled={isMutating}
                      variant="danger"
                    >
                      {isLocking ? t('actions.locking') : t('actions.lock')}
                    </Button>
                  )}
                  {normalizedStatus === 'OPEN' && monthPeriod?.planning_open === false && (
                    <Button onClick={handleOpenPlanning} disabled={isMutating}>
                      {isOpeningPlanning ? t('planning.openAction') : t('planning.openAction')}
                    </Button>
                  )}
                  {normalizedStatus === 'OPEN' && monthPeriod?.planning_open === true && (
                    <Button onClick={handleClosePlanning} disabled={isMutating} variant="secondary">
                      {isClosingPlanning ? t('planning.closeAction') : t('planning.closeAction')}
                    </Button>
                  )}
                  {normalizedStatus === 'LOCKED' && (
                    <Button onClick={handleOpenMonth} disabled={isMutating}>
                      {isUnlocking ? t('actions.opening') : t('actions.unlock')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MonthManagementPage

