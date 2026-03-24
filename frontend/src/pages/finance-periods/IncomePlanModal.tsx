import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateIncomePlanMutation, useUpdateIncomePlanMutation, IncomePlan } from '@/shared/api/incomePlansApi'
import { useListIncomeSourcesQuery } from '@/shared/api/incomeSourcesApi'
import { useCreateMonthPeriodMutation } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { getErrorMessage } from '@/shared/lib/utils'
import './IncomePlanModal.css'

interface IncomePlanModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  onEditExistingPlan?: () => void
  plan?: IncomePlan | null
  usedSourceIds?: number[]
  year: number
  month: number
}

export function IncomePlanModal({
  isOpen,
  onClose,
  onSuccess,
  onEditExistingPlan,
  plan,
  usedSourceIds = [],
  year,
  month,
}: IncomePlanModalProps) {
  const { t } = useTranslation('financePeriods')
  const { role } = useAuth()
  const isEditMode = !!plan

  const [formData, setFormData] = useState({
    source_id: '',
    amount: '',
  })
  const [error, setError] = useState('')
  const [monthPeriodError, setMonthPeriodError] = useState<string | null>(null)

  const [createIncomePlan, { isLoading: isCreating }] = useCreateIncomePlanMutation()
  const [updateIncomePlan, { isLoading: isUpdating }] = useUpdateIncomePlanMutation()
  const [createMonthPeriod, { isLoading: isCreatingMonth }] = useCreateMonthPeriodMutation()

  const { data: sourcesData } = useListIncomeSourcesQuery({ is_active: true })
  const sources = useMemo(() => {
    if (!sourcesData) return []
    return Array.isArray(sourcesData) ? sourcesData : (sourcesData.results || [])
  }, [sourcesData])

  const sourceOptions = useMemo(() => {
    const safeUsedSourceIds = usedSourceIds ?? []
    const usedSet = new Set(safeUsedSourceIds)
    return sources
      .filter((source) => isEditMode || !usedSet.has(source?.id))
      .map((source) => ({
        value: String(source?.id ?? ''),
        label: source.name,
      }))
  }, [isEditMode, sources, usedSourceIds])
  const hasNoAvailableSources = !isEditMode && sourceOptions.length === 0

  const isLoading = isCreating || isUpdating

  // Initialize form data when plan changes
  useEffect(() => {
    if (plan) {
      const sourceId = plan.source_id ?? plan.source?.id
      setFormData({
        source_id: String(sourceId ?? ''),
        amount: plan.amount,
      })
    } else {
      setFormData({
        source_id: '',
        amount: '',
      })
    }
    setError('')
    setMonthPeriodError(null)
  }, [plan, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMonthPeriodError(null)

    // Validation
    if (!formData.source_id) {
      setError(t('incomePlan.sourceRequired'))
      return
    }

    const amountNum = parseFloat(formData.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError(t('incomePlan.amountPositive'))
      return
    }

    try {
      if (isEditMode && plan) {
        await updateIncomePlan({
          id: plan.id,
          data: {
            source_id: parseInt(formData.source_id, 10),
            amount: amountNum,
          },
        }).unwrap()
      } else {
        await createIncomePlan({
          year,
          month,
          source_id: parseInt(formData.source_id, 10),
          amount: amountNum,
        }).unwrap()
      }

      onSuccess()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setError(errorMessage || t('incomePlan.saveFailed'))
      
      // Check if error is about missing MonthPeriod
      if (errorMessage && errorMessage.includes('Month period') && errorMessage.includes('does not exist')) {
        setMonthPeriodError(errorMessage)
      } else {
        setMonthPeriodError(null)
      }
    }
  }

  const handleCreateMonthPeriod = async () => {
    if (!year || !month) return
    
    const monthStr = `${year}-${String(month).padStart(2, '0')}` // "2026-02"
    
    try {
      await createMonthPeriod({ month: monthStr }).unwrap()
      setMonthPeriodError(null)
      setError('')
      // Retry income plan creation after month period is created
      const amountNum = parseFloat(formData.amount)
      if (!isNaN(amountNum) && amountNum > 0 && formData.source_id) {
        await createIncomePlan({
          year,
          month,
          source_id: parseInt(formData.source_id, 10),
          amount: amountNum,
        }).unwrap()
        onSuccess()
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('incomePlan.saveFailed'))
      setMonthPeriodError(null)
    }
  }

  const handleClose = () => {
    setFormData({ source_id: '', amount: '' })
    setError('')
    setMonthPeriodError(null)
    onClose()
  }
  const handleEditInstead = () => {
    handleClose()
    onEditExistingPlan?.()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditMode ? t('incomePlan.editTitle') : t('incomePlan.addTitle')}>
      <form onSubmit={handleSubmit} className="income-plan-modal-form">
        <Select
          label={t('incomePlan.source')}
          value={formData.source_id}
          onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
          options={[
            { value: '', label: t('incomePlan.selectSource') },
            ...sourceOptions,
          ]}
          required
          disabled={hasNoAvailableSources}
          error={error && !formData.source_id ? error : undefined}
        />
        {hasNoAvailableSources && (
          <div className="form-error">
            {t('incomePlan.noAvailableSources')}
          </div>
        )}
        {hasNoAvailableSources && (
          <Button type="button" variant="secondary" onClick={handleEditInstead}>
            {t('incomePlan.editInstead')}
          </Button>
        )}

        <Input
          label={t('incomePlan.amount')}
          type="number"
          step="0.01"
          min="0"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          required
          error={error && formData.source_id && !formData.amount ? error : undefined}
        />

        {error && <div className="form-error">{error}</div>}

        {monthPeriodError && role === 'admin' && (
          <div className="month-period-error">
            <div className="month-period-error-message">{monthPeriodError}</div>
            <Button
              type="button"
              onClick={handleCreateMonthPeriod}
              disabled={isCreatingMonth || !year || !month}
              variant="secondary"
            >
              {isCreatingMonth ? t('incomePlan.creatingMonthPeriod') : t('incomePlan.createMonthPeriod')}
            </Button>
          </div>
        )}

        <div className="modal-actions">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={isLoading}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button type="submit" disabled={isLoading || hasNoAvailableSources}>
            {isLoading ? (isEditMode ? t('updating', { ns: 'common' }) : t('creating', { ns: 'common' })) : (isEditMode ? t('update', { ns: 'common' }) : t('create', { ns: 'common' }))}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

