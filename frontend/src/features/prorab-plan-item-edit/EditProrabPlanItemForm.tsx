import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateProrabPlanItemMutation } from '@/shared/api/prorabApi'
import { ProrabPlanItem } from '@/shared/api/prorabApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditProrabPlanItemForm.css'

interface EditProrabPlanItemFormProps {
  planId: number
  periodId?: number
  item: ProrabPlanItem
  onSuccess?: () => void
  onCancel?: () => void
}

export function EditProrabPlanItemForm({ planId, periodId, item, onSuccess, onCancel }: EditProrabPlanItemFormProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    category: item.category,
    name: item.name,
    amount: item.amount,
  })
  const [error, setError] = useState('')
  
  const [updatePlanItem, { isLoading }] = useUpdateProrabPlanItemMutation()
  
  // Fetch all project categories, then filter subcategories (parent_id !== null)
  const { data: allCategories } = useListExpenseCategoriesQuery({ scope: 'project' })
  const subcategories = allCategories?.results.filter(cat => cat.parent_id !== null) || []

  useEffect(() => {
    setFormData({
      category: item.category,
      name: item.name,
      amount: item.amount,
    })
  }, [item])

  const validateForm = (): string | null => {
    // Validate category
    if (!formData.category) {
      return 'Category is required'
    }

    // Validate name
    if (!formData.name.trim()) {
      return 'Material name is required'
    }
    if (formData.name.trim().length < 2) {
      return 'Material name must be at least 2 characters'
    }

    // Validate amount - must be positive number
    const amountNum = Number(formData.amount)
    if (!formData.amount || isNaN(amountNum) || amountNum <= 0) {
      return 'Amount must be a positive number'
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
      // Cast amount to number
      const amountNum = Number(formData.amount)
      
      await updatePlanItem({
        planId,
        periodId,
        itemId: item.id,
        data: {
          category: formData.category,
          name: formData.name.trim(),
          amount: amountNum,
        },
      }).unwrap()
      
      onSuccess?.()
    } catch (err: any) {
      const errorStatus = (err as any)?.status
      if (errorStatus === 409) {
        setError(t('prorab.plan.errors.periodClosed'))
      } else {
        setError(getErrorMessage(err) || t('prorab.plan.errors.updateItemFailed'))
      }
    }
  }

  const categoryOptions = [
    { value: '', label: t('prorab.plan.items.fields.selectCategory') || 'Select category...' },
    ...subcategories.map((cat) => ({
      value: cat.id.toString(),
      label: cat.name,
    })),
  ]

  return (
    <form onSubmit={handleSubmit} className="edit-prorab-plan-item-form">
      <Select
        label={t('prorab.plan.items.fields.category') || 'Category'}
        value={formData.category?.toString() || ''}
        onChange={(e) => setFormData({ ...formData, category: e.target.value ? Number(e.target.value) : null })}
        options={categoryOptions}
        required
        disabled={isLoading}
      />
      <Input
        label={t('prorab.plan.items.fields.name')}
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
        placeholder="бетон"
        disabled={isLoading}
      />
      <Input
        label={t('prorab.plan.items.fields.amount')}
        type="number"
        step="0.01"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        required
        disabled={isLoading}
      />
      {error && <div className="form-error">{error}</div>}
      <div className="form-actions">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t('prorab.plan.items.buttons.updating') : t('prorab.plan.items.buttons.update')}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}

