import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCreateTransferMutation,
  useUpdateTransferMutation,
  type Transfer,
} from '@/shared/api/transfersApi'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { getErrorMessage } from '@/shared/lib/utils'
import './TransferModal.css'

interface TransferModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  transfer?: Transfer | null
}

export function TransferModal({
  isOpen,
  onClose,
  onSuccess,
  transfer,
}: TransferModalProps) {
  const { t } = useTranslation(['common', 'transfers'])
  const isEditMode = !!transfer

  const accountOptions: { value: 'CASH' | 'BANK'; label: string }[] = [
    { value: 'CASH', label: t('transfers:cash') },
    { value: 'BANK', label: t('transfers:bank') },
  ]

  const currencyOptions: { value: 'KGS' | 'USD'; label: string }[] = [
    { value: 'KGS', label: t('transfers:currencyKgs') },
    { value: 'USD', label: t('transfers:currencyUsd') },
  ]

  const [formData, setFormData] = useState({
    source_account: 'CASH' as 'CASH' | 'BANK',
    destination_account: 'BANK' as 'CASH' | 'BANK',
    currency: 'KGS' as 'KGS' | 'USD',
    amount: '',
    transferred_at: '',
    comment: '',
  })
  const [error, setError] = useState('')

  const [createTransfer, { isLoading: isCreating }] = useCreateTransferMutation()
  const [updateTransfer, { isLoading: isUpdating }] = useUpdateTransferMutation()
  const isLoading = isCreating || isUpdating

  useEffect(() => {
    if (transfer) {
      const dateStr = transfer.transferred_at
        ? new Date(transfer.transferred_at).toISOString().split('T')[0]
        : ''
      setFormData({
        source_account: transfer.source_account,
        destination_account: transfer.destination_account,
        currency: transfer.currency ?? 'KGS',
        amount: transfer.amount,
        transferred_at: dateStr,
        comment: transfer.comment || '',
      })
    } else {
      setFormData({
        source_account: 'CASH',
        destination_account: 'BANK',
        currency: 'KGS',
        amount: '',
        transferred_at: '',
        comment: '',
      })
    }
    setError('')
  }, [transfer, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const amountNum = parseFloat(formData.amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError(t('transfers:errors.amountPositive'))
      return
    }
    if (!formData.transferred_at) {
      setError(t('transfers:errors.dateRequired'))
      return
    }
    if (formData.source_account === formData.destination_account) {
      setError(t('transfers:errors.sameAccount'))
      return
    }

    try {
      if (isEditMode && transfer) {
        await updateTransfer({
          id: transfer.id,
          data: {
            source_account: formData.source_account,
            destination_account: formData.destination_account,
            currency: formData.currency,
            amount: amountNum,
            transferred_at: formData.transferred_at,
            comment: formData.comment.trim() || undefined,
          },
        }).unwrap()
      } else {
        await createTransfer({
          source_account: formData.source_account,
          destination_account: formData.destination_account,
          currency: formData.currency,
          amount: amountNum,
          transferred_at: formData.transferred_at,
          comment: formData.comment.trim() || undefined,
        }).unwrap()
      }
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('transfers:errors.saveFailed'))
    }
  }

  const handleClose = () => {
    setFormData({
      source_account: 'CASH',
      destination_account: 'BANK',
      currency: 'KGS',
      amount: '',
      transferred_at: '',
      comment: '',
    })
    setError('')
    onClose()
  }

  const fromOptions = accountOptions
  const toOptions = accountOptions.filter((opt) => opt.value !== formData.source_account)

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditMode ? t('transfers:title.edit') : t('transfers:title.add')}
    >
      <form onSubmit={handleSubmit} className="transfer-modal-form">
        <Select
          label={t('transfers:fromAccount')}
          options={fromOptions}
          value={formData.source_account}
          onChange={(e) =>
            setFormData({
              ...formData,
              source_account: e.target.value as 'CASH' | 'BANK',
              destination_account:
                e.target.value === formData.destination_account
                  ? (e.target.value === 'CASH' ? 'BANK' : 'CASH')
                  : formData.destination_account,
            })
          }
        />
        <Select
          label={t('transfers:toAccount')}
          options={toOptions}
          value={formData.destination_account}
          onChange={(e) =>
            setFormData({ ...formData, destination_account: e.target.value as 'CASH' | 'BANK' })
          }
        />
        <Select
          label={t('transfers:currency')}
          options={currencyOptions}
          value={formData.currency}
          onChange={(e) =>
            setFormData({ ...formData, currency: e.target.value as 'KGS' | 'USD' })
          }
        />
        <Input
          label={t('transfers:amount')}
          type="number"
          step="0.01"
          min="0"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          required
        />
        <Input
          label={t('transfers:date')}
          type="date"
          value={formData.transferred_at}
          onChange={(e) => setFormData({ ...formData, transferred_at: e.target.value })}
          required
        />
        <div className="form-field">
          <label className="form-label">{t('transfers:comment')}</label>
          <textarea
            className="form-textarea"
            value={formData.comment}
            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
            rows={2}
          />
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <Button type="button" onClick={handleClose} variant="secondary" disabled={isLoading}>
            {t('cancel', { ns: 'common' })}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading
              ? isEditMode
                ? t('updating', { ns: 'common' })
                : t('creating', { ns: 'common' })
              : isEditMode
                ? t('update', { ns: 'common' })
                : t('create', { ns: 'common' })}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
