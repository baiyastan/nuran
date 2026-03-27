import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseCategoryMutation, useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Button } from '@/shared/ui/Button/Button'
import { getCreateCategoryErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

type Scope = 'office' | 'project' | 'charity'

interface CreateCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  scope: Scope
}

export function CreateCategoryModal({
  isOpen,
  onClose,
  onSuccess,
  scope,
}: CreateCategoryModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const [createCategory, { isLoading }] = useCreateExpenseCategoryMutation()

  const { data: rootCategoriesData } = useListExpenseCategoriesQuery(
    { scope, parent: null, is_active: true, is_system_root: true },
    { skip: !isOpen }
  )

  const rootCategories = (rootCategoriesData?.results ?? []).filter(
    (category) => category.is_system_root && category.parent_id === null
  )
  const canonicalRoot = rootCategories[0] ?? null

  useEffect(() => {
    if (isOpen) {
      setName('')
      setSelectedParentId(canonicalRoot?.id ?? null)
      setError('')
    }
  }, [isOpen, canonicalRoot?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError(t('categories.modals.create.nameRequired'))
      return
    }
    try {
      if (!selectedParentId) {
        setError('Системный root не найден. Обратитесь к администратору.')
        return
      }
      await createCategory({
        name: name.trim(),
        scope,
        parent: selectedParentId,
      }).unwrap()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      const parsedError = getCreateCategoryErrorMessage(err)
      if (parsedError.translationKey) {
        setError(t(parsedError.translationKey))
      } else if (parsedError.message) {
        setError(parsedError.message)
      } else {
        setError(t('categories.modals.create.createError'))
      }
    }
  }

  if (!isOpen) return null

  const title = t('categories.modals.create.title')

  if (!canonicalRoot) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={title}>
        <div className="category-form">
          <p className="category-modal-message">
            Системный root не найден. Обратитесь к администратору.
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="category-form">
        <div className="form-field">
          <label className="input-label">
            {t('categories.name')} <span style={{ color: '#dc3545' }}>*</span>
          </label>
          <input
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="form-field">
          <label className="input-label">{t('categories.parentSelectorLabel')}</label>
          <select
            className="input"
            value={selectedParentId ?? canonicalRoot.id}
            onChange={(e) =>
              setSelectedParentId(e.target.value === '' ? null : Number(e.target.value))
            }
            disabled
          >
            <option value={canonicalRoot.id}>{canonicalRoot.name} (системный root)</option>
          </select>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading || !name.trim()}>
            {isLoading ? t('categories.modals.create.creating') : t('categories.modals.create.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
