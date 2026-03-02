import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseCategoryMutation, useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateCategoryModal.css'

interface CreateCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  defaultScope?: 'project' | 'office' | 'charity'
}

export function CreateCategoryModal({
  isOpen,
  onClose,
  defaultScope = 'project',
}: CreateCategoryModalProps) {
  const { t } = useTranslation(['categories', 'common'])
  const [formData, setFormData] = useState({
    name: '',
    scope: defaultScope as 'project' | 'office' | 'charity',
    parent: null as number | null,
  })
  const [error, setError] = useState('')

  const [createCategory, { isLoading }] = useCreateExpenseCategoryMutation()
  const { data: rootCategories } = useListExpenseCategoriesQuery({
    scope: formData.scope,
    parent: null,
  })

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        scope: defaultScope,
        parent: null,
      })
      setError('')
    }
  }, [isOpen, defaultScope])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError('Name is required')
      return
    }

    try {
      await createCategory({
        name: formData.name.trim(),
        scope: formData.scope,
        parent: formData.parent || null,
      }).unwrap()

      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to create category')
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('categories.modals.create.title')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="create-category-form">
          <div className="form-field">
            <label className="input-label">
              {t('categories.scope')} <span style={{ color: '#dc3545' }}>*</span>
            </label>
            <select
              className="input"
              value={formData.scope}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  scope: e.target.value as 'project' | 'office',
                  parent: null, // Reset parent when scope changes
                })
              }
              required
            >
              <option value="project">{t('categories.project')}</option>
              <option value="office">{t('categories.office')}</option>
            </select>
          </div>

          <div className="form-field">
            <label className="input-label">{t('categories.parentCategory')}</label>
            <select
              className="input"
              value={formData.parent || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  parent: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">{t('categories.all')}</option>
              {rootCategories?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
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
              {isLoading ? t('categories.modals.create.creating') : t('categories.modals.create.create')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

