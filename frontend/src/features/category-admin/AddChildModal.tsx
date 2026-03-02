import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseCategoryMutation, ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

interface AddChildModalProps {
  isOpen: boolean
  onClose: () => void
  parent: ExpenseCategory | null
  onSuccess?: () => void
}

export function AddChildModal({ isOpen, onClose, parent, onSuccess }: AddChildModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
  })
  const [error, setError] = useState('')

  const [createCategory, { isLoading }] = useCreateExpenseCategoryMutation()

  useEffect(() => {
    if (isOpen && parent) {
      setFormData({
        name: '',
      })
      setError('')
    }
  }, [isOpen, parent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!parent) {
      setError(t('categories.modals.addChild.parentRequired'))
      return
    }

    if (!formData.name.trim()) {
      setError(t('categories.modals.addChild.nameRequired'))
      return
    }

    try {
      await createCategory({
        name: formData.name.trim(),
        scope: parent.scope, // Inherit scope from parent
        parent: parent.id,
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('categories.modals.addChild.createError'))
    }
  }

  if (!isOpen || !parent) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.addChild.title')}>
      <form onSubmit={handleSubmit} className="category-form">
        <div className="form-field">
          <label className="input-label">{t('categories.parentCategory')}</label>
          <input
            type="text"
            className="input"
            value={parent.name}
            disabled
            readOnly
          />
        </div>

        <div className="form-field">
          <label className="input-label">{t('categories.scope')}</label>
          <input
            type="text"
            className="input"
            value={parent.scope}
            disabled
            readOnly
          />
          <small style={{ color: '#666', fontSize: '0.875rem', marginTop: '4px', display: 'block' }}>
            {t('categories.scopeInherited')}
          </small>
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
            {isLoading ? t('categories.modals.addChild.creating') : t('categories.modals.addChild.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

