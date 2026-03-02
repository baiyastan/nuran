import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseCategoryMutation, useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './CategoryModals.css'

type Scope = 'office' | 'project' | 'charity'

interface CreateCategoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  scope: Scope
}

const ROOT_NAME_KEYS: Record<Scope, string> = {
  office: 'categories.modals.create.rootNameOffice',
  project: 'categories.modals.create.rootNameProject',
  charity: 'categories.modals.create.rootNameCharity',
}

export function CreateCategoryModal({
  isOpen,
  onClose,
  onSuccess,
  scope,
}: CreateCategoryModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const [createCategory, { isLoading }] = useCreateExpenseCategoryMutation()

  const { data: rootCategoriesData, refetch: refetchRoots } = useListExpenseCategoriesQuery(
    { scope, parent: null, is_active: true },
    { skip: !isOpen }
  )

  const rootCategories = rootCategoriesData?.results ?? []
  const singleRoot = rootCategories.length > 0 ? rootCategories[0] : null
  const hasRoot = rootCategories.length > 0

  useEffect(() => {
    if (isOpen) {
      setName('')
      setError('')
    }
  }, [isOpen])

  const handleCreateRoot = async () => {
    setError('')
    const rootName = t(ROOT_NAME_KEYS[scope])
    try {
      await createCategory({
        name: rootName,
        scope,
        parent: null,
      }).unwrap()
      await refetchRoots()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('categories.modals.create.createError'))
    }
  }

  const handleCreateChild = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!singleRoot) return
    if (!name.trim()) {
      setError(t('categories.modals.create.nameRequired'))
      return
    }
    try {
      await createCategory({
        name: name.trim(),
        scope,
        parent: singleRoot.id,
      }).unwrap()
      onSuccess?.()
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('categories.modals.create.createError'))
    }
  }

  if (!isOpen) return null

  const title = t('categories.modals.create.title')

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      {!hasRoot ? (
        <div className="category-form">
          <p className="category-modal-message">
            {t('categories.modals.create.noRootMessage')}
          </p>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions" style={{ marginTop: '1rem' }}>
            <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreateRoot}
              disabled={isLoading}
            >
              {isLoading ? t('categories.modals.create.creating') : t('categories.modals.create.createRootButton')}
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreateChild} className="category-form">
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
      )}
    </Modal>
  )
}
