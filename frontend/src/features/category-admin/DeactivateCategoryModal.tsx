import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateExpenseCategoryMutation, ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

interface DeactivateCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  category: ExpenseCategory | null
  onSuccess?: () => void
}

export function DeactivateCategoryModal({ isOpen, onClose, category, onSuccess }: DeactivateCategoryModalProps) {
  const { t } = useTranslation()
  const [error, setError] = useState('')

  const [updateCategory, { isLoading }] = useUpdateExpenseCategoryMutation()

  const handleConfirm = async () => {
    if (!category) {
      setError(t('categories.modals.deactivate.categoryRequired'))
      return
    }

    setError('')

    try {
      await updateCategory({
        id: category.id,
        data: {
          is_active: false,
        },
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: any) {
      setError(getErrorMessage(err) || t('categories.modals.deactivate.deactivateError'))
    }
  }

  if (!isOpen || !category) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.deactivate.title')}>
      <div className="category-form">
        <p>
          {t('categories.modals.deactivate.message')} <strong>{category.name}</strong>?
        </p>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          {t('categories.modals.deactivate.description')}
        </p>

        {error && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? t('categories.modals.deactivate.deactivating') : t('categories.modals.deactivate.deactivate')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

