import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateActualExpenseMutation } from '@/shared/api/actualExpensesApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import type { ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateActualExpenseModal.css'

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

interface CreateActualExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  month: string
  scope: ScopeUI
}

export function CreateActualExpenseModal({
  isOpen,
  onClose,
  month,
  scope,
}: CreateActualExpenseModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    categoryId: null as number | null,
    amount: '',
    spent_at: new Date().toISOString().split('T')[0],
    comment: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null)

  const [createExpense, { isLoading }] = useCreateActualExpenseMutation()
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

  const filteredCategories = categorySearch.trim()
    ? leafCategories.filter((cat) =>
        cat.name.toLowerCase().includes(categorySearch.toLowerCase())
      )
    : leafCategories

  useEffect(() => {
    if (!isOpen) {
      setFormData({
        categoryId: null,
        amount: '',
        spent_at: new Date().toISOString().split('T')[0],
        comment: '',
      })
      setErrors({})
      setApiError('')
      setCategorySearch('')
      setIsCategoryOpen(false)
      setHighlightedIndex(null)
    }
  }, [isOpen])

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

    if (!validateForm()) {
      return
    }

    try {
      await createExpense({
        month,
        scope,
        category: formData.categoryId ?? undefined,
        amount: parseFloat(formData.amount),
        spent_at: formData.spent_at,
        comment: formData.comment.trim(),
      }).unwrap()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('expenses.loadError'))
    }
  }

  const handleCategorySelect = (category: ExpenseCategory) => {
    setFormData((prev) => ({
      ...prev,
      categoryId: category.id,
    }))
    setCategorySearch(category.name)
    setIsCategoryOpen(false)
    setHighlightedIndex(null)
    if (errors.categoryId) {
      setErrors((prev) => ({ ...prev, categoryId: '' }))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('expenses.createModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="create-actual-expense-modal-form">
        <div className="form-field">
          <label className="input-label">
            {t('expenses.form.category')}
          </label>
          <div className="category-combobox">
            <input
              className={`input ${errors.categoryId ? 'input-error' : ''}`}
              type="text"
              value={categorySearch}
              placeholder={t('expenses.form.selectCategory')}
              onFocus={() => {
                setIsCategoryOpen(true)
              }}
              onClick={() => {
                setIsCategoryOpen(true)
              }}
              onChange={(e) => {
                setCategorySearch(e.target.value)
                setIsCategoryOpen(true)
                setHighlightedIndex(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  if (!isCategoryOpen) {
                    if (filteredCategories.length > 0) {
                      setIsCategoryOpen(true)
                      setHighlightedIndex(0)
                    }
                    return
                  }
                  setHighlightedIndex((prev) => {
                    if (filteredCategories.length === 0) return null
                    if (prev === null || prev >= filteredCategories.length - 1) return 0
                    return prev + 1
                  })
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (!isCategoryOpen) {
                    if (filteredCategories.length > 0) {
                      setIsCategoryOpen(true)
                      setHighlightedIndex(filteredCategories.length - 1)
                    }
                    return
                  }
                  setHighlightedIndex((prev) => {
                    if (filteredCategories.length === 0) return null
                    if (prev === null || prev <= 0) return filteredCategories.length - 1
                    return prev - 1
                  })
                } else if (e.key === 'Enter') {
                  if (isCategoryOpen && highlightedIndex !== null && filteredCategories[highlightedIndex]) {
                    e.preventDefault()
                    handleCategorySelect(filteredCategories[highlightedIndex])
                  }
                } else if (e.key === 'Escape') {
                  if (isCategoryOpen) {
                    e.preventDefault()
                    setIsCategoryOpen(false)
                    setHighlightedIndex(null)
                  }
                }
              }}
            />
            {isCategoryOpen && (
              <div className="category-combobox-dropdown">
                {filteredCategories.length === 0 ? (
                  <div className="category-combobox-no-results">
                    {/* TODO: add i18n key expenses.form.noCategoryResults */}
                    No results
                  </div>
                ) : (
                  filteredCategories.map((cat, index) => (
                    <div
                      key={cat.id}
                      className={`category-combobox-option${
                        index === highlightedIndex ? ' highlighted' : ''
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleCategorySelect(cat)
                      }}
                    >
                      {cat.name}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
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
        />

        <Input
          label={t('expenses.form.spentAt')}
          type="date"
          value={formData.spent_at}
          onChange={(e) => setFormData({ ...formData, spent_at: e.target.value })}
          error={errors.spent_at}
          required
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
