import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { MonthSelector } from '@/pages/reports/components/MonthSelector'
import {
  useGetMonthPeriodQuery,
  useCreateMonthPeriodMutation,
  useLockMonthPeriodMutation,
  useUnlockMonthPeriodMutation,
} from '@/shared/api/monthPeriodsApi'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { Button } from '@/shared/ui/Button/Button'

function MonthManagementPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showSuccess, showError } = useToastContext()
  const [searchParams, setSearchParams] = useSearchParams()

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
    try {
      if (!monthPeriod) {
        await createMonthPeriod({ month: selectedMonth }).unwrap()
      } else if (monthPeriod.status === 'LOCKED') {
        await unlockMonthPeriod(monthPeriod.id).unwrap()
      }
      await refetch()
      showSuccess(
        t('monthManagement.openSuccess', {
          defaultValue: 'Month opened successfully',
        }),
      )
    } catch (err: any) {
      showError(
        t('monthManagement.openError', {
          defaultValue: 'Failed to open month',
        }),
      )
    }
  }

  const handleLockMonth = async () => {
    if (!monthPeriod) return
    try {
      await lockMonthPeriod(monthPeriod.id).unwrap()
      await refetch()
      showSuccess(
        t('monthManagement.lockSuccess', {
          defaultValue: 'Month locked successfully',
        }),
      )
    } catch (err: any) {
      showError(
        t('monthManagement.lockError', {
          defaultValue: 'Failed to lock month',
        }),
      )
    }
  }

  const goBack = () => {
    navigate(-1)
  }

  const isMutating = isCreating || isLocking || isUnlocking

  return (
    <div className="finance-periods-page">
      <div className="page-header">
        <div>
          <h1>{t('monthManagement.title', { defaultValue: 'Month management' })}</h1>
          <p className="help-text">
            {t('monthManagement.helpText', {
              defaultValue:
                'Open, lock or unlock months. Month lock controls when plans can be edited across the system.',
            })}
          </p>
        </div>
        <Button variant="secondary" onClick={goBack}>
          {t('common.back')}
        </Button>
      </div>

      <div className="month-selector">
        <MonthSelector
          value={selectedMonth}
          onChange={handleMonthChange}
          monthStatus={monthPeriod?.status ?? null}
        />
      </div>

      <div className="finance-periods-list">
        {isLoading ? (
          <div className="loading">{t('common.loading')}</div>
        ) : error ? (
          <div className="error">
            {t('monthManagement.loadError', {
              defaultValue: 'Failed to load month status',
            })}
          </div>
        ) : (
          <div className="month-gate-card">
            <div className="month-gate-card__header">
              <h3 className="month-gate-card__title">{selectedMonth}</h3>
              <span className="month-status-badge">
                {normalizedStatus === 'NOT_CREATED'
                  ? t('monthManagement.status.notCreated', { defaultValue: 'Not opened' })
                  : normalizedStatus === 'OPEN'
                  ? t('common.status.OPEN')
                  : t('common.status.LOCKED')}
              </span>
            </div>
            <div className="month-gate-card__content">
              {normalizedStatus === 'NOT_CREATED' && (
                <>
                  <p>
                    {t('monthManagement.notOpened', {
                      defaultValue: 'Month is not opened.',
                    })}
                  </p>
                  <Button onClick={handleOpenMonth} disabled={isMutating}>
                    {isCreating
                      ? t('monthManagement.opening', { defaultValue: 'Opening…' })
                      : t('monthManagement.openButton', { defaultValue: 'Open month' })}
                  </Button>
                </>
              )}
              {normalizedStatus === 'OPEN' && (
                <>
                  <p>
                    {t('monthManagement.open', {
                      defaultValue: 'Month is open.',
                    })}
                  </p>
                  <Button
                    onClick={handleLockMonth}
                    disabled={isMutating}
                    variant="danger"
                  >
                    {isLocking
                      ? t('monthManagement.locking', { defaultValue: 'Locking…' })
                      : t('monthManagement.lockButton', { defaultValue: 'Lock month' })}
                  </Button>
                </>
              )}
              {normalizedStatus === 'LOCKED' && (
                <>
                  <p>
                    {t('monthManagement.locked', {
                      defaultValue: 'Month is locked.',
                    })}
                  </p>
                  <Button onClick={handleOpenMonth} disabled={isMutating}>
                    {isUnlocking
                      ? t('monthManagement.opening', { defaultValue: 'Opening…' })
                      : t('monthManagement.unlockButton', { defaultValue: 'Unlock month' })}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MonthManagementPage

