import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListExpenseCategoriesQuery,
  useDeleteExpenseCategoryMutation,
  ExpenseCategory,
} from '@/shared/api/expenseCategoriesApi'
import { Button } from '@/shared/ui/Button/Button'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CreateCategoryModal } from './components/CreateCategoryModal'
import { EditCategoryModal } from './components/EditCategoryModal'
import { displayCategoryName } from '@/shared/lib/categoryUtils'
import { toast } from '@/shared/ui/Toast/toast'
import './CategoriesPage.css'

type Scope = 'office' | 'project' | 'charity'

interface TreeRow {
  category: ExpenseCategory
  depth: 0 | 1
}

function buildTree(categories: ExpenseCategory[]): TreeRow[] {
  const roots = categories.filter((c) => c.parent_id === null)
  const byParent = new Map<number | null, ExpenseCategory[]>()
  byParent.set(null, roots)
  categories.forEach((c) => {
    if (c.parent_id !== null) {
      const list = byParent.get(c.parent_id) ?? []
      list.push(c)
      byParent.set(c.parent_id, list)
    }
  })
  const rows: TreeRow[] = []
  roots.forEach((root) => {
    rows.push({ category: root, depth: 0 })
    const children = byParent.get(root.id) ?? []
    children.forEach((child) => rows.push({ category: child, depth: 1 }))
  })
  return rows
}

function CategoriesPage() {
  const { t } = useTranslation()
  const [selectedScope, setSelectedScope] = useState<Scope>('office')
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [deleteCategory] = useDeleteExpenseCategoryMutation()

  const queryParams = useMemo(
    () => ({
      scope: selectedScope,
      ...(showActiveOnly ? { is_active: true } : {}),
    }),
    [selectedScope, showActiveOnly]
  )

  const { data: categoriesData, isLoading, error } = useListExpenseCategoriesQuery(queryParams)

  const categories = useMemo(() => categoriesData?.results ?? [], [categoriesData])
  const treeRows = useMemo(() => buildTree(categories), [categories])

  useEffect(() => {
    if (openMenuId === null) return
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [openMenuId])

  const handleDeleteClick = useCallback(
    async (category: ExpenseCategory) => {
      if ((category.children_count || 0) > 0) return
      if (window.confirm(t('categories.confirmDelete', { name: category.name }))) {
        try {
          await deleteCategory(category.id).unwrap()
          setOpenMenuId(null)
        } catch (err) {
          console.error('Delete failed:', err)
          toast.error(t('categories.deleteError'))
        }
      }
    },
    [t, deleteCategory]
  )

  const handleCreateSuccess = useCallback(() => {
    setShowCreateModal(false)
  }, [])

  const handleEditSuccess = useCallback(() => {
    setEditingCategory(null)
  }, [])

  const isCreateModalOpen = showCreateModal

  return (
    <div className="categories-page">
      <div className="page-header">
        <h2>{t('categories.title')}</h2>
        <Button
          onClick={() => setShowCreateModal(true)}
        >
          {t('categories.create')}
        </Button>
      </div>

      <div className="categories-tabs">
        <button
          type="button"
          className={`tab-button ${selectedScope === 'office' ? 'active' : ''}`}
          onClick={() => setSelectedScope('office')}
        >
          {t('categories.office')}
        </button>
        <button
          type="button"
          className={`tab-button ${selectedScope === 'project' ? 'active' : ''}`}
          onClick={() => setSelectedScope('project')}
        >
          {t('categories.project')}
        </button>
        <button
          type="button"
          className={`tab-button ${selectedScope === 'charity' ? 'active' : ''}`}
          onClick={() => setSelectedScope('charity')}
        >
          {t('categories.charity')}
        </button>
      </div>

      <div className="categories-toolbar">
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
          />
          <span>{t('categories.activeOnly')}</span>
        </label>
      </div>

      {isLoading ? (
        <TableSkeleton columnCount={3} rowCount={8} />
      ) : error ? (
        <div className="error">{t('categories.loadError')}</div>
      ) : treeRows.length === 0 ? (
        <div className="categories-empty">{t('categories.noRootCategories')}</div>
      ) : (
        <div className="category-tree">
          {treeRows.map(({ category, depth }) => (
            <div
              key={category.id}
              className={`category-tree-item category-tree-item--${depth === 0 ? 'root' : 'child'}`}
              style={{ paddingLeft: depth === 0 ? 0 : 24 }}
            >
              <span className="category-tree-item__name">
                {displayCategoryName(category.name)}
              </span>
              <span className="category-tree-item__badge">
                {category.is_active ? (
                  <span className="badge badge-success">{t('categories.active')}</span>
                ) : (
                  <span className="badge badge-inactive">{t('categories.inactive')}</span>
                )}
              </span>
              <div className="category-tree-item__actions" ref={openMenuId === category.id ? menuRef : undefined}>
                <button
                  type="button"
                  className="category-tree-item__menu-trigger"
                  onClick={() => setOpenMenuId((id) => (id === category.id ? null : category.id))}
                  aria-label={t('common.actions')}
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === category.id}
                >
                  ⋮
                </button>
                {openMenuId === category.id && (
                  <div className="category-tree-item__menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setEditingCategory(category)
                        setOpenMenuId(null)
                      }}
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={(category.children_count || 0) > 0}
                      title={
                        (category.children_count || 0) > 0
                          ? t('categories.cannotDeleteHasChildren')
                          : undefined
                      }
                      onClick={() => handleDeleteClick(category)}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateCategoryModal
        isOpen={isCreateModalOpen}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
        scope={selectedScope}
      />

      {editingCategory && (
        <EditCategoryModal
          isOpen={!!editingCategory}
          onClose={() => setEditingCategory(null)}
          onSuccess={handleEditSuccess}
          category={editingCategory}
        />
      )}
    </div>
  )
}

export default CategoriesPage
