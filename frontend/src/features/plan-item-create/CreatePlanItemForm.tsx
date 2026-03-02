import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatePlanItemMutation } from '@/shared/api/planItemsApi'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreatePlanItemForm.css'

interface CreatePlanItemFormProps {
  planPeriodId: number
  onSuccess?: () => void
}

export function CreatePlanItemForm({ planPeriodId, onSuccess }: CreatePlanItemFormProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    category: '',
  })
  const [error, setError] = useState('')
  
  const [createPlanItem, { isLoading }] = useCreatePlanItemMutation()
  
  // Fetch PlanPeriod to get fund_kind (scope)
  const { data: planPeriod } = useGetPlanPeriodQuery(planPeriodId, { skip: !planPeriodId })
  
  // Determine scope from planPeriod.fund_kind
  const scope = planPeriod?.fund_kind || 'project'
  
  // Fetch ExpenseCategories for the scope
  const { data: categoriesData } = useListExpenseCategoriesQuery(
    { scope: scope as 'project' | 'office' | 'charity', is_active: true },
    { skip: !planPeriodId || !scope }
  )
  
  const categories = categoriesData?.results || []

  const validateForm = (): string | null => {
    // Validate title
    if (!formData.title.trim()) {
      return t('planPeriodDetails.form.fields.title') + ' is required'
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
      // Cast amount to number with validation
      const amountNum = Number(formData.amount)
      
      // Double-check amount is valid (shouldn't happen after validation, but safety check)
      if (isNaN(amountNum) || amountNum <= 0) {
        setError('Invalid amount value')
        return
      }

      await createPlanItem({
        title: formData.title.trim(),
        amount: amountNum,
        plan_period: planPeriodId,
        category: formData.category ? Number(formData.category) : null,
      }).unwrap()
      
      onSuccess?.()
      setFormData({
        title: '',
        amount: '',
        category: '',
      })
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('planPeriodDetails.form.error'))
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
        label={t('planPeriodDetails.form.fields.amount')}
        type="number"
        step="0.01"
        min="0"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        required
      />
      
      <div className="form-field">
        <label className="form-label">Категория</label>
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="form-select"
          disabled={!planPeriodId || categories.length === 0}
        >
          <option value="">-- Категория тандаңыз --</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>
      
      {error && <div className="form-error">{error}</div>}
      <Button type="submit" disabled={isLoading}>
        {isLoading ? t('planPeriodDetails.form.submitting') : t('planPeriodDetails.form.submit')}
      </Button>
    </form>
  )
}
