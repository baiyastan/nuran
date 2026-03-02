import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCreateMonthPeriodMutation,
  useOpenMonthPeriodMutation,
  useGetMonthPeriodQuery,
} from '@/shared/api/monthPeriodsApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateFinancePeriodModal.css'

interface CreateFinancePeriodModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateFinancePeriodModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateFinancePeriodModalProps) {
  const { t } = useTranslation()
  const [month, setMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7) // YYYY-MM format
  })
  const [error, setError] = useState('')

  const [createMonthPeriod, { isLoading: isCreating }] = useCreateMonthPeriodMutation()
  const [openMonthPeriod, { isLoading: isOpening }] = useOpenMonthPeriodMutation()
  
  // Check if month period exists
  const { data: existingMonthPeriod, refetch: refetchMonthPeriod } = useGetMonthPeriodQuery(month, {
    skip: !isOpen || !month,
  })

  useEffect(() => {
    if (isOpen && month) {
      refetchMonthPeriod()
    }
  }, [isOpen, month, refetchMonthPeriod])

  useEffect(() => {
    if (!isOpen) {
      setMonth(new Date().toISOString().slice(0, 7))
      setError('')
    }
  }, [isOpen])

  const isLoading = isCreating || isOpening

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!month) {
      setError(t('financePeriods.form.errors.monthRequired'))
      return
    }

    try {
      let monthPeriodId: number

      if (existingMonthPeriod) {
        // Month period exists - open it if locked
        monthPeriodId = existingMonthPeriod.id
        if (existingMonthPeriod.status === 'LOCKED') {
          await openMonthPeriod(monthPeriodId).unwrap()
        }
      } else {
        // Create new month period (it's created with status OPEN by default)
        const result = await createMonthPeriod({ month }).unwrap()
        monthPeriodId = result.id
        // Ensure it's open
        if (result.status !== 'OPEN') {
          await openMonthPeriod(monthPeriodId).unwrap()
        }
      }

      refetchMonthPeriod()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setError(errorMessage || t('financePeriods.createError'))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('financePeriods.createModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="create-finance-period-form">
        <p className="form-description">
          {t('financePeriods.createModal.description')}
        </p>

        <Input
          label={t('financePeriods.form.month')}
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          required
        />

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('financePeriods.actions.creating') : t('financePeriods.actions.createAndOpenMonth')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

