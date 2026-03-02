import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateProjectMutation, CreateProjectRequest } from '@/shared/api/projectsApi'
import { useGetForemenQuery } from '@/shared/api/usersApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreateProjectModal.css'

interface CreateProjectModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prorab_id: '',
  })
  const [errors, setErrors] = useState<{ name?: string; description?: string; prorab_id?: string }>({})
  const [apiError, setApiError] = useState('')
  
  const [createProject, { isLoading }] = useCreateProjectMutation()
  const { data: foremenData, isLoading: isLoadingForemen } = useGetForemenQuery(undefined, {
    skip: !isOpen, // Only fetch when modal is open
  })

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({ name: '', description: '', prorab_id: '' })
      setErrors({})
      setApiError('')
    }
  }, [isOpen])

  const validateForm = (): boolean => {
    const newErrors: { name?: string; description?: string } = {}

    // Validate name
    if (!formData.name.trim()) {
      newErrors.name = t('errors.required')
    } else if (formData.name.trim().length < 2) {
      newErrors.name = t('projects.form.nameMinLength')
    } else if (formData.name.trim().length > 255) {
      newErrors.name = t('projects.form.nameMaxLength')
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
      const payload: CreateProjectRequest = {
        name: formData.name.trim(),
        description: formData.description.trim() || '',
        status: 'active',
      }
      
      // Include prorab_id if selected
      if (formData.prorab_id) {
        payload.prorab_id = parseInt(formData.prorab_id, 10)
      }
      
      await createProject(payload).unwrap()
      
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('projects.form.createError'))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('projects.create')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="create-project-form">
        <Input
          label={t('projects.form.nameLabel')}
          placeholder={t('projects.form.namePlaceholder')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
          autoFocus
        />
        
        <div className="form-field">
          <label className="input-label">
            {t('projects.form.descriptionLabel')}
          </label>
          <textarea
            className={`input ${errors.description ? 'input-error' : ''}`}
            placeholder={t('projects.form.descriptionPlaceholder')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
          />
          {errors.description && (
            <span className="input-error-text">{errors.description}</span>
          )}
        </div>

        <Select
          label={t('projects.form.prorabLabel')}
          value={formData.prorab_id}
          onChange={(e) => setFormData({ ...formData, prorab_id: e.target.value })}
          error={errors.prorab_id}
          options={[
            { value: '', label: t('projects.form.selectProrab') },
            ...(foremenData?.results || []).map((foreman) => ({
              value: foreman.id.toString(),
              label: foreman.email,
            })),
          ]}
          disabled={isLoadingForemen}
        />

        {apiError && <div className="form-error">{apiError}</div>}

        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isLoading}
          >
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

