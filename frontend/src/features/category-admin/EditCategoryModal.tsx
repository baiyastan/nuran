import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateExpenseCategoryMutation, ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

interface EditCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  category: ExpenseCategory | null
  onSuccess?: () => void
}

export function EditCategoryModal({ isOpen, onClose, category, onSuccess }: EditCategoryModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    scope: 'project' as 'project' | 'office',
  })
  const [error, setError] = useState('')

  const [updateCategory, { isLoading }] = useUpdateExpenseCategoryMutation()

  useEffect(() => {
    if (isOpen && category) {
      setFormData({
        name: category.name,
        scope: category.scope,
      })
      setError('')
    }
  }, [isOpen, category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!category) {
      setError(t('categories.modals.edit.categoryRequired'))
      return
    }

    if (!formData.name.trim()) {
      setError(t('categories.modals.edit.nameRequired'))
      return
    }

    try {
      await updateCategory({
        id: category.id,
        data: {
          name: formData.name.trim(),
          scope: category.parent_id === null ? formData.scope : undefined, // Only update scope if root
        },
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(getErrorMessage(err) || t('categories.modals.edit.updateError'))
    }
  }

  if (!isOpen || !category) return null

  const isRoot = category.parent_id === null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.edit.title')}>
      <form onSubmit={handleSubmit} className="category-form">
        {!isRoot && (
          <div className="form-field">
            <label className="input-label">{t('categories.parentCategory')}</label>
            <input
              type="text"
              className="input"
              value={category.parent_id?.toString() || 'N/A'}
              disabled
              readOnly
            />
          </div>
        )}

        <div className="form-field">
          <label className="input-label">{t('categories.scope')}</label>
          {isRoot ? (
            <select
              className="input"
              value={formData.scope}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  scope: e.target.value as 'project' | 'office',
                })
              }
            >
              <option value="project">{t('categories.project')}</option>
              <option value="office">{t('categories.office')}</option>
            </select>
          ) : (
            <>
              <input
                type="text"
                className="input"
                value={formData.scope}
                disabled
                readOnly
              />
              <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '4px', display: 'block' }}>
                {t('categories.scopeInherited')}
              </small>
            </>
          )}
        </div>

        <Input
          label={t('categories.name')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={error}
          required
        />

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.name.trim()}>
            {isLoading ? t('categories.modals.edit.updating') : t('categories.modals.edit.update')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

