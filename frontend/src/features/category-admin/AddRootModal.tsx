import { useTranslation } from 'react-i18next'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Button } from '@/shared/ui/Button/Button'
import './CategoryModals.css'

interface AddRootModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddRootModal({ isOpen, onClose }: AddRootModalProps) {
  const { t } = useTranslation()
  const isLoading = false

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('categories.modals.addRoot.title')}>
      <div className="category-form">
        <div className="category-modal-message">
          Root categories are system-defined and cannot be created manually.
        </div>
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

