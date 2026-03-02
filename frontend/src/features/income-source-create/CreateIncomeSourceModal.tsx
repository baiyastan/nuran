import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateIncomeSourceMutation } from '@/shared/api/incomeSourcesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateIncomeSourceModal.css'

interface CreateIncomeSourceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function CreateIncomeSourceModal({ isOpen, onClose, onSuccess }: CreateIncomeSourceModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    is_active: true,
  })
  const [error, setError] = useState('')

  const [createIncomeSource, { isLoading }] = useCreateIncomeSourceMutation()

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        is_active: true,
      })
      setError('')
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name.trim()) {
      setError(t('incomeSources.form.nameRequired'))
      return
    }

    try {
      await createIncomeSource({
        name: formData.name.trim(),
        is_active: formData.is_active,
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('incomeSources.form.createError'))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('incomeSources.create')}>
      <form onSubmit={handleSubmit} className="create-income-source-form">
        <Input
          label={t('incomeSources.form.name')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={error && !formData.name.trim() ? error : undefined}
          required
          autoFocus
        />

        <div className="form-field">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <span>{t('incomeSources.form.isActive')}</span>
          </label>
        </div>

        {error && formData.name.trim() && <div className="form-error">{error}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading || !formData.name.trim()}>
            {isLoading ? t('common.creating') : t('common.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

