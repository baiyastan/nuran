import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateIncomeEntryMutation, useUpdateIncomeEntryMutation, IncomeEntry } from '@/shared/api/incomeEntriesApi'
import { useListIncomeSourcesQuery } from '@/shared/api/incomeSourcesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { getErrorMessage } from '@/shared/lib/utils'
import './IncomeEntryModal.css'

interface IncomeEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  entry?: IncomeEntry | null
  financePeriodId: number
}

export function IncomeEntryModal({
  isOpen,
  onClose,
  onSuccess,
  entry,
  financePeriodId,
}: IncomeEntryModalProps) {
  const { t } = useTranslation(['incomeEntries', 'financePeriods', 'common'])
  const isEditMode = !!entry

  const [formData, setFormData] = useState({
    source_id: '',
    account: 'CASH' as 'CASH' | 'BANK',
    currency: 'KGS' as 'KGS' | 'USD',
    amount: '',
    received_at: '',
    comment: '',
  })
  const [error, setError] = useState('')

  const [createIncomeEntry, { isLoading: isCreating }] = useCreateIncomeEntryMutation()
  const [updateIncomeEntry, { isLoading: isUpdating }] = useUpdateIncomeEntryMutation()
  const { data: sourcesData, isLoading: isLoadingSources } = useListIncomeSourcesQuery({ is_active: true })

  const isLoading = isCreating || isUpdating

  // Initialize form data when entry changes
  useEffect(() => {
    if (entry) {
      const dateStr = entry.received_at ? new Date(entry.received_at).toISOString().split('T')[0] : ''
      const sourceId = entry.source?.id || entry.source_id || ''
      setFormData({
        source_id: sourceId ? String(sourceId) : '',
        account: entry.account ?? 'CASH',
        currency: entry.currency ?? 'KGS',
        amount: entry.amount,
        received_at: dateStr,
        comment: entry.comment || '',
      })
    } else {
      setFormData({
        source_id: '',
        account: 'CASH',
        currency: 'KGS',
        amount: '',
        received_at: '',
        comment: '',
      })
    }
    setError('')
  }, [entry, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    const amountNum = parseFloat(formData.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError(t('modal.errors.amountPositive', { defaultValue: 'Amount must be greater than zero' }))
      return
    }

    if (!formData.received_at) {
      setError(t('modal.errors.dateRequired', { defaultValue: 'Date is required' }))
      return
    }

    if (!formData.comment.trim()) {
      setError(t('modal.errors.commentRequired', { defaultValue: 'Comment is required' }))
      return
    }

    // Parse source_id if provided (optional)
    const sourceIdNum = formData.source_id ? parseInt(formData.source_id, 10) : null
    if (formData.source_id && isNaN(sourceIdNum!)) {
      setError(t('modal.errors.saveFailed', { defaultValue: 'Invalid source selected' }))
      return
    }

    try {
      if (isEditMode && entry) {
        const updateData: {
          amount: number
          received_at: string
          comment: string
          account: 'CASH' | 'BANK'
          currency: 'KGS' | 'USD'
          source_id?: number
        } = {
          amount: amountNum,
          received_at: formData.received_at,
          comment: formData.comment.trim(),
          account: formData.account,
          currency: formData.currency,
        }
        if (sourceIdNum !== null) {
          updateData.source_id = sourceIdNum
        }
        await updateIncomeEntry({
          id: entry.id,
          data: updateData,
        }).unwrap()
      } else {
        const createData: {
          finance_period: number
          amount: number
          received_at: string
          comment: string
          account: 'CASH' | 'BANK'
          currency: 'KGS' | 'USD'
          source_id?: number
        } = {
          finance_period: financePeriodId,
          amount: amountNum,
          received_at: formData.received_at,
          comment: formData.comment.trim(),
          account: formData.account,
          currency: formData.currency,
        }
        if (sourceIdNum !== null) {
          createData.source_id = sourceIdNum
        }
        await createIncomeEntry(createData).unwrap()
      }

      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('modal.errors.saveFailed'))
    }
  }

  const handleClose = () => {
    setFormData({ source_id: '', account: 'CASH', currency: 'KGS', amount: '', received_at: '', comment: '' })
    setError('')
    onClose()
  }

  // Prepare source options for Select component
  const sourceOptions = sourcesData?.results
    ? sourcesData.results.map((source) => ({
        value: String(source.id),
        label: source.name,
      }))
    : []

  // Add empty option for placeholder
  const selectOptions = [{ value: '', label: t('incomePlan.selectSource', { ns: 'financePeriods' }) }, ...sourceOptions]

  const accountOptions = [
    { value: 'CASH', label: t('income.common.accountCash', { ns: 'financePeriods' }) },
    { value: 'BANK', label: t('income.common.accountBank', { ns: 'financePeriods' }) },
  ]

  const currencyOptions = [
    { value: 'KGS', label: t('incomeEntries.form.currencyKgs', { defaultValue: 'Кыргызский сом (KGS)' }) },
    { value: 'USD', label: t('incomeEntries.form.currencyUsd', { defaultValue: 'Доллар США (USD)' }) },
  ]

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={isEditMode ? t('modal.title.edit', { defaultValue: 'Edit Income Entry' }) : t('modal.title.add', { defaultValue: 'Add Income Entry' })}>
      <form onSubmit={handleSubmit} className="income-entry-modal-form">
        <Select
          label={t('income.common.source', { ns: 'financePeriods' })}
          options={selectOptions}
          value={formData.source_id}
          onChange={(e) => setFormData({ ...formData, source_id: e.target.value })}
          disabled={isLoadingSources}
        />

        <Select
          label={t('income.common.destinationAccount', { ns: 'financePeriods' })}
          options={accountOptions}
          value={formData.account}
          onChange={(e) => setFormData({ ...formData, account: e.target.value as 'CASH' | 'BANK' })}
        />

        <Select
          label={t('incomeEntries.form.currency', { defaultValue: 'Валюта' })}
          options={currencyOptions}
          value={formData.currency}
          onChange={(e) => setFormData({ ...formData, currency: e.target.value as 'KGS' | 'USD' })}
        />

        <Input
          label={t('income.common.amount', { ns: 'financePeriods' })}
          type="number"
          step="0.01"
          min="0"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          required
          error={error && formData.source_id && !formData.amount ? error : undefined}
        />

        <Input
          label={t('income.common.date', { ns: 'financePeriods' })}
          type="date"
          value={formData.received_at}
          onChange={(e) => setFormData({ ...formData, received_at: e.target.value })}
          required
          error={error && formData.source_id && formData.amount && !formData.received_at ? error : undefined}
        />

        <div className="form-field">
          <label className="form-label">{t('income.common.comment', { ns: 'financePeriods' })}</label>
          <textarea
            className={`form-textarea ${error && formData.source_id && formData.amount && formData.received_at && !formData.comment.trim() ? 'input-error' : ''}`}
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            required
            rows={3}
          />
          {error && formData.source_id && formData.amount && formData.received_at && !formData.comment.trim() && (
            <span className="input-error-text">{error}</span>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={isLoading}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading 
              ? (isEditMode ? t('updating', { ns: 'common' }) : t('creating', { ns: 'common' })) 
              : (isEditMode ? t('update', { ns: 'common' }) : t('create', { ns: 'common' }))}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default IncomeEntryModal

