import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './UserRoleEditor.css'

interface UserRoleEditorProps {
  userId: number
  currentRole: 'admin' | 'director' | 'foreman'
  onSave: (userId: number, role: 'admin' | 'director' | 'foreman') => Promise<void>
}

export function UserRoleEditor({ userId, currentRole, onSave }: UserRoleEditorProps) {
  const { t } = useTranslation()
  const [selectedRole, setSelectedRole] = useState<'admin' | 'director' | 'foreman'>(currentRole)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const roleOptions = [
    { value: 'admin', label: t('users.roles.admin') },
    { value: 'director', label: t('users.roles.director') },
    { value: 'foreman', label: t('users.roles.foreman') },
  ]

  const handleSave = async () => {
    if (selectedRole === currentRole) {
      return // No change
    }

    setIsSaving(true)
    setError('')

    try {
      await onSave(userId, selectedRole)
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('users.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="user-role-editor">
      <Select
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value as 'admin' | 'director' | 'foreman')}
        options={roleOptions}
        disabled={isSaving}
      />
      {selectedRole !== currentRole && (
        <Button
          onClick={handleSave}
          disabled={isSaving}
          size="small"
          style={{ marginLeft: '0.5rem' }}
        >
          {isSaving ? t('common.saving') : t('users.saveRole')}
        </Button>
      )}
      {error && <div className="user-role-error">{error}</div>}
    </div>
  )
}

