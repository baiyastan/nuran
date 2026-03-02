import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateIncomeEntryMutation } from '@/shared/api/incomeEntriesApi'
import { IncomeEntry } from '@/entities/income-entry/model'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditIncomeEntryModal.css'

interface EditIncomeEntryModalProps {
  isOpen: boolean
  onClose: () => void
  incomeEntry: IncomeEntry | null
}

export function EditIncomeEntryModal({
  isOpen,
  onClose,
  incomeEntry,
}: EditIncomeEntryModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    amount: '',
    received_at: '',
    comment: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')

  const [updateIncomeEntry, { isLoading }] = useUpdateIncomeEntryMutation()

  useEffect(() => {
    if (isOpen && incomeEntry) {
      setFormData({
        amount: incomeEntry.amount,
        received_at: incomeEntry.received_at.split('T')[0],
        comment: incomeEntry.comment || '',
      })
      setErrors({})
      setApiError('')
    } else if (!isOpen) {
      setFormData({
        amount: '',
        received_at: '',
        comment: '',
      })
      setErrors({})
      setApiError('')
    }
  }, [isOpen, incomeEntry])

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

    if (!incomeEntry) {
      setApiError(t('incomeEntries.loadError'))
      return
    }

    if (!validateForm()) {
      return
    }

    try {
      const payload: {
        amount: number
        received_at: string
        comment: string
      } = {
        amount: parseFloat(formData.amount),
        received_at: formData.received_at,
        comment: formData.comment.trim(),
      }

      await updateIncomeEntry({ id: incomeEntry.id, data: payload }).unwrap()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('incomeEntries.loadError'))
    }
  }

  if (!incomeEntry) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('incomeEntries.editModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="edit-income-entry-form">
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
          disabled={isLoading}
        />

        <Input
          label={t('incomeEntries.form.receivedAt')}
          type="date"
          value={formData.received_at}
          onChange={(e) => setFormData({ ...formData, received_at: e.target.value })}
          error={errors.received_at}
          required
          disabled={isLoading}
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
            disabled={isLoading}
          />
          {errors.comment && <span className="input-error-text">{errors.comment}</span>}
        </div>

        {apiError && <div className="form-error">{apiError}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

