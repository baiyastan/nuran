import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/shared/hooks/useAuth'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import {
  useGetMonthPeriodQuery,
  useCreateMonthPeriodMutation,
  useOpenMonthPeriodMutation,
  useLockMonthPeriodMutation,
  useUnlockMonthPeriodMutation,
} from '@/shared/api/monthPeriodsApi'
import { getErrorMessage } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/Button/Button'
import './MonthGateCard.css'

interface MonthGateCardProps {
  selectedMonth: string
  onMonthChange?: (month: string) => void
}

export function MonthGateCard({ selectedMonth, onMonthChange: _onMonthChange }: MonthGateCardProps) {
  const { t } = useTranslation()
  const { role } = useAuth()
  const { showSuccess, showError } = useToastContext()
  
  // Fetch month period for selected month
  const {
    data: monthPeriod,
    refetch: refetchMonthPeriod,
  } = useGetMonthPeriodQuery(selectedMonth)
  
  // Mutations
  const [createMonthPeriod, { isLoading: isCreating }] = useCreateMonthPeriodMutation()
  const [openMonthPeriod, { isLoading: isOpening }] = useOpenMonthPeriodMutation()
  const [lockMonthPeriod, { isLoading: isLocking }] = useLockMonthPeriodMutation()
  const [unlockMonthPeriod, { isLoading: isUnlocking }] = useUnlockMonthPeriodMutation()
  
  // Map status: null -> NOT_CREATED, OPEN -> OPEN, LOCKED -> LOCKED
  const normalizedStatus = useMemo(() => {
    if (!monthPeriod) {
      return 'NOT_CREATED'
    }
    if (monthPeriod.status === 'OPEN') {
      return 'OPEN'
    }
    if (monthPeriod.status === 'LOCKED') {
      return 'LOCKED'
    }
    return 'NOT_CREATED'
  }, [monthPeriod])
  
  const canManage = role === 'admin'
  const isLoading = isCreating || isOpening || isLocking || isUnlocking

  const handleCreateAndOpenMonth = async () => {
    try {
      // Create month period
      const created = await createMonthPeriod({ month: selectedMonth }).unwrap()
      // Then open it
      await openMonthPeriod(created.id).unwrap()
      await refetchMonthPeriod()
      showSuccess(t('financePeriods.actions.createAndOpenMonthSuccess'))
    } catch (err) {
      showError(getErrorMessage(err) || t('financePeriods.actions.createAndOpenMonthError'))
    }
  }

  const handleOpenMonth = async () => {
    if (!monthPeriod) return
    
    try {
      await unlockMonthPeriod(monthPeriod.id).unwrap()
      await refetchMonthPeriod()
      showSuccess(t('financePeriods.actions.openMonthSuccess'))
    } catch (err) {
      showError(getErrorMessage(err) || t('financePeriods.actions.openMonthError'))
    }
  }

  const handleLockMonth = async () => {
    if (!monthPeriod) return
    
    try {
      await lockMonthPeriod(monthPeriod.id).unwrap()
      await refetchMonthPeriod()
      showSuccess(t('financePeriods.actions.lockMonthSuccess'))
    } catch (err) {
      showError(getErrorMessage(err) || t('financePeriods.actions.lockMonthError'))
    }
  }

  const getMonthStatusBadge = () => {
    if (normalizedStatus === 'OPEN') {
      return <span className="month-status-badge month-status-badge--open">{t('common.status.OPEN')}</span>
    } else if (normalizedStatus === 'LOCKED') {
      return <span className="month-status-badge month-status-badge--locked">{t('common.status.LOCKED')}</span>
    } else {
      return <span className="month-status-badge month-status-badge--not-created">{t('common.notCreated')}</span>
    }
  }

  return (
    <div className="month-gate-card">
      <div className="month-gate-card__header">
        <h3 className="month-gate-card__title">
          {selectedMonth}
        </h3>
        {getMonthStatusBadge()}
      </div>
      <div className="month-gate-card__content">
        {canManage && (
          <div className="month-gate-card__actions">
            {normalizedStatus === 'NOT_CREATED' && (
              <Button
                onClick={handleCreateAndOpenMonth}
                disabled={isLoading}
              >
                {isCreating || isOpening ? t('common.loading') : t('financePeriods.actions.createAndOpenMonth')}
              </Button>
            )}
            {normalizedStatus === 'OPEN' && (
              <Button
                onClick={handleLockMonth}
                variant="danger"
                disabled={isLoading}
              >
                {isLocking ? t('common.loading', { defaultValue: 'Loading...' }) : t('financePeriods.actions.lockMonth')}
              </Button>
            )}
            {normalizedStatus === 'LOCKED' && (
              <Button
                onClick={handleOpenMonth}
                disabled={isLoading}
              >
                {isUnlocking ? t('common.loading', { defaultValue: 'Loading...' }) : t('financePeriods.actions.openMonth')}
              </Button>
            )}
          </div>
        )}
        {!canManage && (
          <p className="month-gate-card__readonly">
            {t('financePeriods.readOnly')}
          </p>
        )}
      </div>
    </div>
  )
}

