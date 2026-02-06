import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateActualExpenseMutation } from '@/shared/api/actualExpensesApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import { CreateCategoryModal } from '@/features/expense-category-create/CreateCategoryModal'
import './CreateActualExpenseForm.css'

interface CreateActualExpenseFormProps {
  projectId?: number
  periodId?: number
  prorabPlanId?: number
  onSuccess?: () => void
  onCancel?: () => void
}

export function CreateActualExpenseForm({
  projectId,
  periodId,
  prorabPlanId,
  onSuccess,
  onCancel,
}: CreateActualExpenseFormProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    scope: 'project' as 'project' | 'office',
    categoryId: null as number | null,
    subcategoryId: null as number | null,
    name: '',
    amount: '',
    spent_at: new Date().toISOString().split('T')[0],
    comment: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [apiError, setApiError] = useState('')
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)

  const [createExpense, { isLoading }] = useCreateActualExpenseMutation()

  // Fetch root categories filtered by scope
  const { data: rootCategories } = useListExpenseCategoriesQuery({
    scope: formData.scope,
    parent: null,
  })

  // Fetch subcategories when category is selected
  const { data: subcategories } = useListExpenseCategoriesQuery(
    {
      scope: formData.scope,
      parent: formData.categoryId || undefined,
    },
    { skip: !formData.categoryId }
  )

  // Reset subcategory when category changes
  useEffect(() => {
    setFormData((prev) => ({ ...prev, subcategoryId: null }))
  }, [formData.categoryId, formData.scope])

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    const amountNum = Number(formData.amount)
    if (!formData.amount.trim() || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Amount must be a positive number'
    }

    if (!formData.spent_at) {
      newErrors.spent_at = 'Date is required'
    }

    if (!formData.comment.trim()) {
      newErrors.comment = 'Comment is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    setErrors({})

    if (!validateForm()) {
      return
    }

    try {
      const payload: any = {
        name: formData.name.trim(),
        amount: Number(formData.amount),
        spent_at: formData.spent_at,
        comment: formData.comment.trim(),
      }

      // Add category (use subcategory if selected, otherwise root category)
      if (formData.subcategoryId) {
        payload.category = formData.subcategoryId
      } else if (formData.categoryId) {
        payload.category = formData.categoryId
      }

      if (projectId) {
        payload.project = projectId
      }
      if (periodId) {
        payload.period = periodId
      }
      if (prorabPlanId) {
        payload.prorab_plan = prorabPlanId
      }

      await createExpense(payload).unwrap()
      onSuccess?.()
      setFormData({
        scope: 'project',
        categoryId: null,
        subcategoryId: null,
        name: '',
        amount: '',
        spent_at: new Date().toISOString().split('T')[0],
        comment: '',
      })
    } catch (err: any) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || 'Failed to create expense')
    }
  }

  const isSubmitDisabled = isLoading || !formData.comment.trim()

  return (
    <>
      <form onSubmit={handleSubmit} className="create-actual-expense-form">
        <div className="form-field">
          <label className="input-label">
            Scope <span style={{ color: '#dc3545' }}>*</span>
          </label>
          <select
            className={`input ${errors.scope ? 'input-error' : ''}`}
            value={formData.scope}
            onChange={(e) =>
              setFormData({
                ...formData,
                scope: e.target.value as 'project' | 'office',
                categoryId: null,
                subcategoryId: null,
              })
            }
            required
          >
            <option value="project">Project</option>
            <option value="office">Office</option>
          </select>
          {errors.scope && <span className="input-error-text">{errors.scope}</span>}
        </div>

        <div className="form-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="input-label">
              Category
            </label>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => setShowCreateCategoryModal(true)}
            >
              Create Category
            </Button>
          </div>
          <select
            className={`input ${errors.categoryId ? 'input-error' : ''}`}
            value={formData.categoryId || ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                categoryId: e.target.value ? Number(e.target.value) : null,
                subcategoryId: null,
              })
            }
          >
            <option value="">Select category...</option>
            {rootCategories?.results.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <span className="input-error-text">{errors.categoryId}</span>}
        </div>

        {formData.categoryId && (
          <div className="form-field">
            <label className="input-label">Subcategory (optional)</label>
            <select
              className={`input ${errors.subcategoryId ? 'input-error' : ''}`}
              value={formData.subcategoryId || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  subcategoryId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">None</option>
              {subcategories?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.subcategoryId && <span className="input-error-text">{errors.subcategoryId}</span>}
          </div>
        )}

        <Input
          label="Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
        />

      <Input
        label="Amount"
        type="number"
        step="0.01"
        min="0"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        error={errors.amount}
        required
      />

      <Input
        label="Date"
        type="date"
        value={formData.spent_at}
        onChange={(e) => setFormData({ ...formData, spent_at: e.target.value })}
        error={errors.spent_at}
        required
      />

      <div className="form-field">
        <label className="input-label">
          Comment <span style={{ color: '#dc3545' }}>*</span>
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
          placeholder="Enter comment for this expense..."
          required
        />
        {errors.comment && <span className="input-error-text">{errors.comment}</span>}
      </div>

      {apiError && <div className="form-error">{apiError}</div>}

      <div className="form-actions">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitDisabled}>
          {isLoading ? 'Creating...' : 'Create Expense'}
        </Button>
      </div>
    </form>

    <CreateCategoryModal
      isOpen={showCreateCategoryModal}
      onClose={() => setShowCreateCategoryModal(false)}
      defaultScope={formData.scope}
    />
  </>
  )
}

