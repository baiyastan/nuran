import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useUpdateExpenseCategoryMutation,
  useListExpenseCategoriesQuery,
  ExpenseCategory,
} from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import { displayCategoryName } from '@/shared/lib/categoryUtils'
import './CategoryModals.css'

interface EditCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  category: ExpenseCategory | null
}

export function EditCategoryModal({ isOpen, onClose, onSuccess, category }: EditCategoryModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    parent: null as number | null,
    is_active: true,
  })
  const [error, setError] = useState('')

  const [updateCategory, { isLoading }] = useUpdateExpenseCategoryMutation()

  // Fetch root categories for parent dropdown
  const { data: rootCategoriesData } = useListExpenseCategoriesQuery(
    {
      scope: category?.scope || 'project',
      parent: null,
      is_active: true,
    },
    { skip: !category }
  )

  const rootCategories = rootCategoriesData?.results || []

  useEffect(() => {
    if (isOpen && category) {
      setFormData({
        name: category.name,
        parent: category.parent_id,
        is_active: category.is_active,
      })
      setError('')
    }
  }, [isOpen, category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!category) {
      setError(t('categories.modals.edit.categoryRequired') || 'Category is required')
      return
    }

    if (!formData.name.trim()) {
      setError(t('categories.modals.edit.nameRequired') || 'Name is required')
      return
    }

    try {
      await updateCategory({
        id: category.id,
        data: {
          name: formData.name.trim(),
          parent: formData.parent,
          is_active: formData.is_active,
        },
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('categories.modals.edit.updateError') || 'Failed to update category')
    }
  }

  if (!isOpen || !category) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.edit.title') || 'Edit Category'}>
      <form onSubmit={handleSubmit} className="category-form">
        <div className="form-field">
          <label className="input-label">
            {t('categories.name') || 'Name'} <span style={{ color: '#dc3545' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>

        <div className="form-field">
          <label className="input-label">{t('categories.parentSelectorLabel')}</label>
          <select
            className="input"
            value={formData.parent || ''}
            onChange={(e) =>
              setFormData({ ...formData, parent: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">{t('categories.parentOptionTopLevel')}</option>
            {rootCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {displayCategoryName(cat.name)}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label className="input-label">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ marginRight: '8px' }}
            />
            {t('categories.active') || 'Active'}
          </label>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel') || 'Cancel'}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.name.trim()}>
            {isLoading ? t('categories.modals.edit.updating') || 'Updating...' : t('categories.modals.edit.update') || 'Update'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}


