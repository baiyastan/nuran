import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateActualExpenseMutation } from '@/shared/api/actualExpensesApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import type { ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { ActualExpense } from '@/entities/actual-expense/model'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditActualExpenseModal.css'

type ScopeUI = 'OFFICE' | 'PROJECT' | 'CHARITY'

function scopeToCategoryScope(scope: ScopeUI): 'office' | 'project' | 'charity' {
  if (scope === 'OFFICE') return 'office'
  if (scope === 'CHARITY') return 'charity'
  return 'project'
}

function getParentId(
  c: { parent?: number | null | { id?: number }; parent_id?: number | null }
): number | null {
  return typeof c.parent === 'number' ? c.parent : (c.parent as { id?: number } | undefined)?.id ?? c.parent_id ?? null
}

interface EditActualExpenseModalProps {
  isOpen?: boolean
  onClose: () => void
  expense: ActualExpense | null
  month: string
  scope: ScopeUI
  onSuccess?: () => void
}

export function EditActualExpenseModal({
  isOpen = true,
  onClose,
  expense,
  month: _month,
  scope,
  onSuccess,
}: EditActualExpenseModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    categoryId: null as number | null,
    amount: '',
    spent_at: '',
    comment: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')

  const [updateExpense, { isLoading }] = useUpdateActualExpenseMutation()
  const categoryScope = scopeToCategoryScope(scope)

  const { data: categoriesData } = useListExpenseCategoriesQuery({
    scope: categoryScope,
    is_active: true,
  })

  const rawList: ExpenseCategory[] = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData?.results ?? []
  const leafCategories = rawList.filter((cat) => {
    if (getParentId(cat) == null) return false
    if (cat.children_count !== undefined) return cat.children_count === 0
    return true
  })

  useEffect(() => {
    if (isOpen && expense) {
      const currentCategoryId = expense.category_id ?? expense.category ?? null
      setFormData({
        categoryId: currentCategoryId,
        amount: expense.amount ?? '',
        spent_at: expense.spent_at ? expense.spent_at.split('T')[0] : '',
        comment: expense.comment ?? '',
      })
      setErrors({})
      setApiError('')
    } else if (!isOpen) {
      setFormData({
        categoryId: null,
        amount: '',
        spent_at: '',
        comment: '',
      })
      setErrors({})
      setApiError('')
    }
  }, [isOpen, expense])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (formData.categoryId == null) {
      newErrors.categoryId = t('expenses.form.errors.categoryRequired')
    }

    if (!formData.amount.trim()) {
      newErrors.amount = t('expenses.form.errors.amountRequired')
    } else {
      const amountNum = parseFloat(formData.amount)
      if (isNaN(amountNum) || amountNum <= 0) {
        newErrors.amount = t('expenses.form.errors.amountPositive')
      }
    }

    if (!formData.spent_at) {
      newErrors.spent_at = t('expenses.form.errors.spentAtRequired')
    }

    if (!formData.comment.trim()) {
      newErrors.comment = t('expenses.form.errors.commentRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')

    if (!expense) {
      setApiError(t('expenses.loadError'))
      return
    }

    if (!validateForm()) {
      return
    }

    try {
      await updateExpense({
        id: expense.id,
        data: {
          amount: String(parseFloat(formData.amount)),
          spent_at: formData.spent_at,
          comment: formData.comment.trim(),
          category: formData.categoryId ?? undefined,
        },
      }).unwrap()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('expenses.loadError'))
    }
  }

  if (!expense) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('expenses.editModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="edit-actual-expense-modal-form">
        <div className="form-field">
          <label className="input-label">
            {t('expenses.form.category')}
          </label>
          <select
            className={`input ${errors.categoryId ? 'input-error' : ''}`}
            value={formData.categoryId ?? ''}
            onChange={(e) =>
              setFormData({
                ...formData,
                categoryId: e.target.value ? Number(e.target.value) : null,
              })
            }
            disabled={isLoading}
          >
            <option value="">{t('expenses.form.selectCategory')}</option>
            {leafCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {errors.categoryId && <span className="input-error-text">{errors.categoryId}</span>}
          {leafCategories.length === 0 && (
            <span className="input-error-text">
              {/* TODO: add i18n key expenses.form.noCategories */}
              No expense categories for this scope
            </span>
          )}
        </div>

        <Input
          label={t('expenses.form.amount')}
          type="number"
          step="0.01"
          min="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          error={errors.amount}
          required
          disabled={isLoading}
        />

        <Input
          label={t('expenses.form.spentAt')}
          type="date"
          value={formData.spent_at}
          onChange={(e) => setFormData({ ...formData, spent_at: e.target.value })}
          error={errors.spent_at}
          required
          disabled={isLoading}
        />

        <div className="form-field">
          <label className="input-label">
            {t('expenses.form.comment')} <span style={{ color: '#dc3545' }}>*</span>
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
            placeholder={t('expenses.form.comment')}
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
