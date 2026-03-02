import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateProjectMutation, UpdateProjectRequest, Project } from '@/shared/api/projectsApi'
import { useGetForemenQuery } from '@/shared/api/usersApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Input } from '@/shared/ui/Input/Input'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditProjectModal.css'

interface EditProjectModalProps {
  isOpen: boolean
  onClose: () => void
  project: Project | null
}

export function EditProjectModal({ isOpen, onClose, project }: EditProjectModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'active' as 'active' | 'completed' | 'on_hold',
    prorab_id: '',
  })
  const [errors, setErrors] = useState<{ name?: string; description?: string; prorab_id?: string }>({})
  const [apiError, setApiError] = useState('')
  
  const [updateProject, { isLoading }] = useUpdateProjectMutation()
  const { data: foremenData, isLoading: isLoadingForemen } = useGetForemenQuery(undefined, {
    skip: !isOpen, // Only fetch when modal is open
  })

  // Reset form when modal opens/closes or project changes
  useEffect(() => {
    if (isOpen && project) {
      setFormData({
        name: project.name,
        description: project.description || '',
        status: project.status,
        prorab_id: project.assigned_prorab_id?.toString() || '',
      })
      setErrors({})
      setApiError('')
    } else if (!isOpen) {
      setFormData({ name: '', description: '', status: 'active', prorab_id: '' })
      setErrors({})
      setApiError('')
    }
  }, [isOpen, project])

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

    if (!project) {
      setApiError(t('projects.form.projectNotFound'))
      return
    }

    if (!validateForm()) {
      return
    }

    try {
      const payload: UpdateProjectRequest = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        status: formData.status,
      }
      
      // Include prorab_id if selected, or null if cleared
      if (formData.prorab_id) {
        payload.prorab_id = parseInt(formData.prorab_id, 10)
      } else {
        // If there was an assigned foreman but now cleared, send null
        if (project.assigned_prorab_id) {
          payload.prorab_id = null
        }
      }
      
      await updateProject({ id: project.id, data: payload }).unwrap()
      
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('projects.form.updateError'))
    }
  }

  if (!project) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('projects.edit')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="edit-project-form">
        <Input
          label={t('projects.form.nameLabel')}
          placeholder={t('projects.form.namePlaceholder')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          error={errors.name}
          required
          autoFocus
          disabled={isLoading}
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
            disabled={isLoading}
          />
          {errors.description && (
            <span className="input-error-text">{errors.description}</span>
          )}
        </div>

        <Select
          label={t('projects.form.statusLabel') || 'Status'}
          value={formData.status}
          onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'completed' | 'on_hold' })}
          options={[
            { value: 'active', label: t('projects.statuses.active') || 'Active' },
            { value: 'completed', label: t('projects.statuses.completed') || 'Completed' },
            { value: 'on_hold', label: t('projects.statuses.onHold') || 'On Hold' },
          ]}
          disabled={isLoading}
        />

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
          disabled={isLoadingForemen || isLoading}
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
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

