import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateIncomeSourceMutation, IncomeSource } from '@/shared/api/incomeSourcesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditIncomeSourceModal.css'

interface EditIncomeSourceModalProps {
  isOpen: boolean
  onClose: () => void
  source: IncomeSource | null
  onSuccess?: () => void
}

export function EditIncomeSourceModal({ isOpen, onClose, source, onSuccess }: EditIncomeSourceModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    is_active: true,
  })
  const [error, setError] = useState('')

  const [updateIncomeSource, { isLoading }] = useUpdateIncomeSourceMutation()

  useEffect(() => {
    if (isOpen && source) {
      setFormData({
        name: source.name,
        is_active: source.is_active,
      })
      setError('')
    }
  }, [isOpen, source])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!source) {
      setError(t('incomeSources.form.sourceRequired'))
      return
    }

    if (!formData.name.trim()) {
      setError(t('incomeSources.form.nameRequired'))
      return
    }

    try {
      await updateIncomeSource({
        id: source.id,
        data: {
          name: formData.name.trim(),
          is_active: formData.is_active,
        },
      }).unwrap()

      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('incomeSources.form.updateError'))
    }
  }

  if (!isOpen || !source) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('incomeSources.edit')}>
      <form onSubmit={handleSubmit} className="edit-income-source-form">
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
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

