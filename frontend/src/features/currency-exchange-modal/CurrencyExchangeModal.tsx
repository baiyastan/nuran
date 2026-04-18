import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useCreateCurrencyExchangeMutation,
  useUpdateCurrencyExchangeMutation,
  type CurrencyExchange,
} from '@/shared/api/currencyExchangesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { getErrorMessage } from '@/shared/lib/utils'
import './CurrencyExchangeModal.css'

interface CurrencyExchangeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  exchange?: CurrencyExchange | null
}

type Account = 'CASH' | 'BANK'
type Currency = 'KGS' | 'USD'

export function CurrencyExchangeModal({
  isOpen,
  onClose,
  onSuccess,
  exchange,
}: CurrencyExchangeModalProps) {
  const { t } = useTranslation(['common', 'currencyExchange'])
  const isEditMode = !!exchange

  const accountOptions: { value: Account; label: string }[] = [
    { value: 'CASH', label: t('currencyExchange:cash') },
    { value: 'BANK', label: t('currencyExchange:bank') },
  ]

  const currencyOptions: { value: Currency; label: string }[] = [
    { value: 'KGS', label: t('currencyExchange:currencyKgs') },
    { value: 'USD', label: t('currencyExchange:currencyUsd') },
  ]

  const [formData, setFormData] = useState({
    source_account: 'CASH' as Account,
    source_currency: 'USD' as Currency,
    source_amount: '',
    destination_account: 'CASH' as Account,
    destination_currency: 'KGS' as Currency,
    destination_amount: '',
    exchanged_at: '',
    comment: '',
  })
  const [error, setError] = useState('')

  const [createExchange, { isLoading: isCreating }] = useCreateCurrencyExchangeMutation()
  const [updateExchange, { isLoading: isUpdating }] = useUpdateCurrencyExchangeMutation()
  const isLoading = isCreating || isUpdating

  useEffect(() => {
    if (exchange) {
      const dateStr = exchange.exchanged_at
        ? new Date(exchange.exchanged_at).toISOString().split('T')[0]
        : ''
      setFormData({
        source_account: exchange.source_account,
        source_currency: exchange.source_currency,
        source_amount: exchange.source_amount,
        destination_account: exchange.destination_account,
        destination_currency: exchange.destination_currency,
        destination_amount: exchange.destination_amount,
        exchanged_at: dateStr,
        comment: exchange.comment || '',
      })
    } else {
      setFormData({
        source_account: 'CASH',
        source_currency: 'USD',
        source_amount: '',
        destination_account: 'CASH',
        destination_currency: 'KGS',
        destination_amount: '',
        exchanged_at: '',
        comment: '',
      })
    }
    setError('')
  }, [exchange, isOpen])

  const sourceAmountNum = parseFloat(formData.source_amount)
  const destinationAmountNum = parseFloat(formData.destination_amount)
  const rate =
    !isNaN(sourceAmountNum) && sourceAmountNum > 0 &&
    !isNaN(destinationAmountNum) && destinationAmountNum > 0
      ? destinationAmountNum / sourceAmountNum
      : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (isNaN(sourceAmountNum) || sourceAmountNum <= 0) {
      setError(t('currencyExchange:errors.sourceAmountPositive'))
      return
    }
    if (isNaN(destinationAmountNum) || destinationAmountNum <= 0) {
      setError(t('currencyExchange:errors.destinationAmountPositive'))
      return
    }
    if (formData.source_currency === formData.destination_currency) {
      setError(t('currencyExchange:errors.sameCurrency'))
      return
    }
    if (!formData.exchanged_at) {
      setError(t('currencyExchange:errors.dateRequired'))
      return
    }

    const payload = {
      source_account: formData.source_account,
      source_currency: formData.source_currency,
      source_amount: sourceAmountNum,
      destination_account: formData.destination_account,
      destination_currency: formData.destination_currency,
      destination_amount: destinationAmountNum,
      exchanged_at: formData.exchanged_at,
      comment: formData.comment.trim() || undefined,
    }

    try {
      if (isEditMode && exchange) {
        await updateExchange({ id: exchange.id, data: payload }).unwrap()
      } else {
        await createExchange(payload).unwrap()
      }
      onSuccess()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('currencyExchange:errors.saveFailed'))
    }
  }

  const handleClose = () => {
    setError('')
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        isEditMode
          ? t('currencyExchange:title.edit')
          : t('currencyExchange:title.add')
      }
    >
      <form onSubmit={handleSubmit} className="currency-exchange-modal-form">
        <div className="form-row">
          <Select
            label={t('currencyExchange:sourceAccount')}
            options={accountOptions}
            value={formData.source_account}
            onChange={(e) =>
              setFormData({ ...formData, source_account: e.target.value as Account })
            }
          />
          <Select
            label={t('currencyExchange:sourceCurrency')}
            options={currencyOptions}
            value={formData.source_currency}
            onChange={(e) => {
              const next = e.target.value as Currency
              setFormData({
                ...formData,
                source_currency: next,
                destination_currency:
                  next === formData.destination_currency
                    ? next === 'KGS' ? 'USD' : 'KGS'
                    : formData.destination_currency,
              })
            }}
          />
        </div>
        <Input
          label={t('currencyExchange:sourceAmount')}
          type="number"
          step="0.01"
          min="0"
          value={formData.source_amount}
          onChange={(e) => setFormData({ ...formData, source_amount: e.target.value })}
          required
        />

        <div className="form-row">
          <Select
            label={t('currencyExchange:destinationAccount')}
            options={accountOptions}
            value={formData.destination_account}
            onChange={(e) =>
              setFormData({ ...formData, destination_account: e.target.value as Account })
            }
          />
          <Select
            label={t('currencyExchange:destinationCurrency')}
            options={currencyOptions}
            value={formData.destination_currency}
            onChange={(e) => {
              const next = e.target.value as Currency
              setFormData({
                ...formData,
                destination_currency: next,
                source_currency:
                  next === formData.source_currency
                    ? next === 'KGS' ? 'USD' : 'KGS'
                    : formData.source_currency,
              })
            }}
          />
        </div>
        <Input
          label={t('currencyExchange:destinationAmount')}
          type="number"
          step="0.01"
          min="0"
          value={formData.destination_amount}
          onChange={(e) => setFormData({ ...formData, destination_amount: e.target.value })}
          required
        />

        {rate !== null && (
          <div className="rate-hint">
            {t('currencyExchange:rateHint', {
              defaultValue: 'Курс: 1 {{src}} = {{rate}} {{dst}}',
              src: formData.source_currency,
              rate: rate.toFixed(4),
              dst: formData.destination_currency,
            })}
          </div>
        )}

        <Input
          label={t('currencyExchange:date')}
          type="date"
          value={formData.exchanged_at}
          onChange={(e) => setFormData({ ...formData, exchanged_at: e.target.value })}
          required
        />
        <div className="form-field">
          <label className="form-label">{t('currencyExchange:comment')}</label>
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
