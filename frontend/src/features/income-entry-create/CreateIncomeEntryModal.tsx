import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateIncomeEntryMutation } from '@/shared/api/incomeEntriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateIncomeEntryModal.css'

interface CreateIncomeEntryModalProps {
  isOpen: boolean
  onClose: () => void
  financePeriodId: number
}

export function CreateIncomeEntryModal({
  isOpen,
  onClose,
  financePeriodId,
}: CreateIncomeEntryModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    amount: '',
    received_at: new Date().toISOString().split('T')[0],
    comment: '',
    account: 'CASH' as 'CASH' | 'BANK',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')

  const [createIncomeEntry, { isLoading }] = useCreateIncomeEntryMutation()

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        amount: '',
        received_at: new Date().toISOString().split('T')[0],
        comment: '',
        account: 'CASH',
      })
      setErrors({})
      setApiError('')
    }
  }, [isOpen])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.amount.trim()) {
      newErrors.amount = t('incomeEntries.form.errors.amountRequired')
    } else {
      const amountNum = parseFloat(formData.amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        newErrors.amount = t('incomeEntries.form.errors.amountPositive')
      }
    }

    if (!formData.received_at) {
      newErrors.received_at = t('incomeEntries.form.errors.receivedAtRequired')
    }

    if (!formData.comment.trim()) {
      newErrors.comment = t('incomeEntries.form.errors.commentRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')

    if (!validateForm()) {
      return
    }

    try {
      const payload: {
        finance_period: number
        amount: number
        received_at: string
        comment: string
        account: 'CASH' | 'BANK'
      } = {
        finance_period: financePeriodId,
        amount: parseFloat(formData.amount),
        received_at: formData.received_at,
        comment: formData.comment.trim(),
        account: formData.account,
      }

      await createIncomeEntry(payload).unwrap()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('incomeEntries.loadError'))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('incomeEntries.createModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="create-income-entry-form">
        <Input
          label={t('incomeEntries.form.amount')}
          type="number"
          step="0.01"
          min="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          error={errors.amount}
          required
          autoFocus
        />

        <div className="form-field">
          <label className="input-label">
            {t('incomeEntries.form.account')}
          </label>
          <select
            className="input"
            value={formData.account}
            onChange={(e) =>
              setFormData({ ...formData, account: e.target.value as 'CASH' | 'BANK' })
            }
          >
            <option value="CASH">{t('incomeEntries.form.accountCash')}</option>
            <option value="BANK">{t('incomeEntries.form.accountBank')}</option>
          </select>
        </div>

        <Input
          label={t('incomeEntries.form.receivedAt')}
          type="date"
          value={formData.received_at}
          onChange={(e) => setFormData({ ...formData, received_at: e.target.value })}
          error={errors.received_at}
          required
        />

        <div className="form-field">
          <label className="input-label">
            {t('incomeEntries.form.comment')} <span style={{ color: '#dc3545' }}>*</span>
          </label>
          <textarea
            className={`input ${errors.comment ? 'input-error' : ''}`}
            value={formData.comment}
            onChange={(e) => {
              setFormData({ ...formData, comment: e.target.value })
              if (errors.comment) {
                setErrors({ ...errors, comment: '' })
              }
            }}
            rows={4}
            placeholder={t('incomeEntries.form.comment')}
            required
          />
          {errors.comment && <span className="input-error-text">{errors.comment}</span>}
        </div>

        {apiError && <div className="form-error">{apiError}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('common.creating') : t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

