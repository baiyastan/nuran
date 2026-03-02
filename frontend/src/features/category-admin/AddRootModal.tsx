import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseCategoryMutation } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

interface AddRootModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddRootModal({ isOpen, onClose, onSuccess }: AddRootModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    scope: 'project' as 'project' | 'office',
  })
  const [error, setError] = useState('')

  const [createCategory, { isLoading }] = useCreateExpenseCategoryMutation()

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        scope: 'project',
      })
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError(t('categories.modals.addRoot.nameRequired'))
      return
    }

    try {
      await createCategory({
        name: formData.name.trim(),
        scope: formData.scope,
        parent: null,
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('categories.modals.addRoot.createError'))
    }
  }

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.addRoot.title')}>
      <form onSubmit={handleSubmit} className="category-form">
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
              })
            }
            required
          >
            <option value="project">{t('categories.project')}</option>
            <option value="office">{t('categories.office')}</option>
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
            {isLoading ? t('categories.modals.addRoot.creating') : t('categories.modals.addRoot.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

