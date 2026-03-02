import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateBudgetLineMutation } from '@/shared/api/budgetingApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/budgetingApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateBudgetLineForm.css'

interface CreateBudgetLineFormProps {
  planId: number
  onSuccess?: () => void
}

export function CreateBudgetLineForm({ planId, onSuccess }: CreateBudgetLineFormProps) {
  const { t } = useTranslation('reports')
  const [formData, setFormData] = useState({
    category: '',
    amount_planned: '',
    note: '',
  })
  const [error, setError] = useState('')
  
  const [createBudgetLine, { isLoading }] = useCreateBudgetLineMutation()
  
  // Fetch ExpenseCategories for office scope, active only
  const { data: categoriesData, isLoading: categoriesLoading } = useListExpenseCategoriesQuery(
    { scope: 'office', is_active: true }
  )
  
  // Filter to leaf categories only (children_count === 0)
  const leafCategories = useMemo(() => {
    if (!categoriesData?.results) return []
    return categoriesData.results.filter(cat => cat.children_count === 0)
  }, [categoriesData])

  const validateForm = (): string | null => {
    // Validate category
    if (!formData.category.trim()) {
      return t('expense.form.categoryRequired') || 'Category is required'
    }

    // Validate amount - must be positive number
    const amountNum = Number(formData.amount_planned)
    if (!formData.amount_planned.trim() || isNaN(amountNum) || amountNum <= 0) {
      return t('expense.form.amountRequired') || 'Amount must be a positive number'
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
      const amountNum = Number(formData.amount_planned)
      
      // Double-check amount is valid (shouldn't happen after validation, but safety check)
      if (isNaN(amountNum) || amountNum <= 0) {
        setError('Invalid amount value')
        return
      }

      await createBudgetLine({
        plan: planId,
        category: Number(formData.category),
        amount_planned: amountNum,
        note: formData.note.trim() || undefined,
      }).unwrap()
      
      onSuccess?.()
      setFormData({
        category: '',
        amount_planned: '',
        note: '',
      })
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('expense.form.error') || 'Failed to create budget line')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="create-budget-line-form">
      <h3>{t('expense.form.addBudgetLine') || 'Add Planned Expense'}</h3>
      
      <div className="form-row">
        <div className="form-field">
          <label className="form-label">{t('expense.form.category') || 'Category'}</label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="form-select"
            disabled={categoriesLoading || leafCategories.length === 0}
            required
          >
            <option value="">-- {t('expense.form.selectCategory') || 'Select Category'} --</option>
            {leafCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
        
        <Input
          label={t('expense.form.amount') || 'Amount'}
          type="number"
          step="0.01"
          min="0"
          value={formData.amount_planned}
          onChange={(e) => setFormData({ ...formData, amount_planned: e.target.value })}
          required
        />
      </div>
      
      <Input
        label={t('expense.form.note') || 'Note (optional)'}
        value={formData.note}
        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
      />
      
      {error && <div className="form-error">{error}</div>}
      <Button type="submit" disabled={isLoading || categoriesLoading || leafCategories.length === 0}>
        {isLoading ? (t('expense.form.submitting') || 'Creating...') : (t('expense.form.submit') || 'Create')}
      </Button>
    </form>
  )
}

