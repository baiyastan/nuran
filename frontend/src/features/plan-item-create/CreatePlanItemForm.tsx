import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatePlanItemMutation } from '@/shared/api/planItemsApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import './CreatePlanItemForm.css'

interface CreatePlanItemFormProps {
  planPeriodId: number
  onSuccess?: () => void
}

export function CreatePlanItemForm({ planPeriodId, onSuccess }: CreatePlanItemFormProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    title: '',
    category: '',
    qty: '',
    unit: '',
    amount: '',
    note: '',
  })
  const [error, setError] = useState('')
  
  const [createPlanItem, { isLoading }] = useCreatePlanItemMutation()

  const validateForm = (): string | null => {
    // Validate title
    if (!formData.title.trim()) {
      return t('planPeriodDetails.form.fields.title') + ' is required'
    }

    // Validate category
    if (!formData.category.trim()) {
      return t('planPeriodDetails.form.fields.category') + ' is required'
    }

    // Validate quantity - must be positive number
    const qtyNum = Number(formData.qty)
    if (!formData.qty.trim() || isNaN(qtyNum) || qtyNum <= 0) {
      return t('planPeriodDetails.form.fields.quantity') + ' must be a positive number'
    }

    // Validate unit - must be non-empty string and non-numeric
    if (!formData.unit.trim()) {
      return t('planPeriodDetails.form.fields.unit') + ' is required'
    }
    if (!isNaN(Number(formData.unit.trim()))) {
      return t('planPeriodDetails.form.fields.unit') + ' must be a text value (not a number)'
    }

    // Validate amount - must be positive number
    const amountNum = Number(formData.amount)
    if (!formData.amount.trim() || isNaN(amountNum) || amountNum <= 0) {
      return t('planPeriodDetails.form.fields.amount') + ' must be a positive number'
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Validate form before submission
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    
    try {
      // Cast to numbers with validation
      const qtyNum = Number(formData.qty)
      const amountNum = Number(formData.amount)
      
      // Double-check numbers are valid (shouldn't happen after validation, but safety check)
      if (isNaN(qtyNum) || isNaN(amountNum) || qtyNum <= 0 || amountNum <= 0) {
        setError('Invalid numeric values')
        return
      }

      await createPlanItem({
        title: formData.title.trim(),
        category: formData.category.trim(),
        qty: qtyNum,
        unit: formData.unit.trim(),
        amount: amountNum,
        note: formData.note.trim(),
        plan_period: planPeriodId,
      }).unwrap()
      
      onSuccess?.()
      setFormData({
        title: '',
        category: '',
        qty: '',
        unit: '',
        amount: '',
        note: '',
      })
    } catch (err: any) {
      setError(err.data?.detail || err.message || t('planPeriodDetails.form.error'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="create-plan-item-form">
      <Input
        label={t('planPeriodDetails.form.fields.title')}
        value={formData.title}
        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        required
      />
      <Input
        label={t('planPeriodDetails.form.fields.category')}
        value={formData.category}
        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
        required
      />
      <div className="form-row">
        <Input
          label={t('planPeriodDetails.form.fields.quantity')}
          type="number"
          step="0.01"
          value={formData.qty}
          onChange={(e) => setFormData({ ...formData, qty: e.target.value })}
          required
        />
        <Input
          label={t('planPeriodDetails.form.fields.unit')}
          value={formData.unit}
          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          required
        />
      </div>
      <Input
        label={t('planPeriodDetails.form.fields.amount')}
        type="number"
        step="0.01"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        required
      />
      <Input
        label={t('planPeriodDetails.form.fields.note')}
        value={formData.note}
        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
      />
      {error && <div className="form-error">{error}</div>}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? t('planPeriodDetails.form.submitting') : t('planPeriodDetails.form.submit')}
      </Button>
    </form>
  )
}
