import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListExpenseCategoriesQuery,
  useDeleteExpenseCategoryMutation,
  ExpenseCategory,
} from '@/shared/api/expenseCategoriesApi'
import { Button } from '@/shared/ui/Button/Button'
import { Table } from '@/shared/ui/Table/Table'
import { CreateCategoryModal } from './components/CreateCategoryModal'
import { EditCategoryModal } from './components/EditCategoryModal'
import { toast } from '@/shared/ui/Toast/toast'
import './CategoriesPage.css'

type Scope = 'office' | 'project' | 'charity'
type ParentFilter = 'all' | 'root' | number

function CategoriesPage() {
  const { t } = useTranslation()
  const [selectedScope, setSelectedScope] = useState<Scope>('office')
  const [showActiveOnly, setShowActiveOnly] = useState(true)
  const [selectedParent, setSelectedParent] = useState<ParentFilter>('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)

  const [deleteCategory] = useDeleteExpenseCategoryMutation()

  // Build query params
  const queryParams = useMemo(() => {
    const params: {
      scope: Scope
      is_active?: boolean
      parent?: number | null
    } = {
      scope: selectedScope,
    }

    if (showActiveOnly) {
      params.is_active = true
    }

    if (selectedParent !== 'all') {
      params.parent = selectedParent === 'root' ? null : selectedParent
    }

    return params
  }, [selectedScope, showActiveOnly, selectedParent])

  // Fetch categories with filters
  const { data: categoriesData, isLoading, error } = useListExpenseCategoriesQuery(queryParams)

  // Fetch all categories for parent dropdown options
  const { data: allCategoriesData } = useListExpenseCategoriesQuery({
    scope: selectedScope,
    is_active: true,
  })

  // Get root categories for parent filter dropdown
  const rootCategories = useMemo(() => {
    return allCategoriesData?.results.filter((cat) => cat.parent_id === null) || []
  }, [allCategoriesData])

  // Build parent name map for table display
  const parentNameMap = useMemo(() => {
    const map = new Map<number, string>()
    allCategoriesData?.results.forEach((cat) => {
      map.set(cat.id, cat.name)
    })
    return map
  }, [allCategoriesData])

  const categories = useMemo(() => categoriesData?.results ?? [], [categoriesData])

  const handleDeleteClick = useCallback(async (category: ExpenseCategory) => {
    if ((category.children_count || 0) > 0) {
      return
    }

    if (window.confirm(t('categories.confirmDelete', { name: category.name }))) {
      try {
        await deleteCategory(category.id).unwrap()
      } catch (err) {
        console.error('Delete failed:', err)
        toast.error(t('categories.deleteError'))
      }
    }
  }, [t, deleteCategory])

  // Table columns
  const columns = [
    { key: 'name', label: t('categories.name') },
    { key: 'parent', label: t('categories.parent') },
    { key: 'children', label: t('categories.children') },
    { key: 'active', label: t('categories.active') },
    { key: 'actions', label: t('common.actions') },
  ]

  // Table data
  const tableData = useMemo(() => {
    return categories.map((category) => ({
      name: category.name,
      parent: category.parent_id ? parentNameMap.get(category.parent_id) || '—' : '—',
      children: category.children_count || 0,
      active: category.is_active ? (
        <span className="badge badge-success">Active</span>
      ) : (
        <span className="badge badge-inactive">Inactive</span>
      ),
      actions: (
        <div className="table-actions">
          <Button
            size="small"
            variant="secondary"
            onClick={() => setEditingCategory(category)}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => handleDeleteClick(category)}
            disabled={(category.children_count || 0) > 0}
            title={
              (category.children_count || 0) > 0
                ? t('categories.cannotDeleteHasChildren')
                : ''
            }
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    }))
  }, [categories, parentNameMap, t, handleDeleteClick])

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
  }

  const handleEditSuccess = () => {
    setEditingCategory(null)
  }

  return (
    <div className="categories-page">
      <div className="page-header">
        <h2>{t('categories.title')}</h2>
        <Button onClick={() => setShowCreateModal(true)}>
          {t('categories.create')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="categories-tabs">
        <button
          className={`tab-button ${selectedScope === 'office' ? 'active' : ''}`}
          onClick={() => {
            setSelectedScope('office')
            setSelectedParent('all')
          }}
        >
          {t('categories.office')}
        </button>
        <button
          className={`tab-button ${selectedScope === 'project' ? 'active' : ''}`}
          onClick={() => {
            setSelectedScope('project')
            setSelectedParent('all')
          }}
        >
          {t('categories.project')}
        </button>
        <button
          className={`tab-button ${selectedScope === 'charity' ? 'active' : ''}`}
          onClick={() => {
            setSelectedScope('charity')
            setSelectedParent('all')
          }}
        >
          {t('categories.charity')}
        </button>
      </div>

      {/* Toolbar */}
      <div className="categories-toolbar">
        <label className="toolbar-checkbox">
          <input
            type="checkbox"
            checked={showActiveOnly}
            onChange={(e) => setShowActiveOnly(e.target.checked)}
          />
          <span>{t('categories.activeOnly')}</span>
        </label>

        <div className="toolbar-select">
          <label>{t('categories.filterByParent')}</label>
          <select
            value={selectedParent === 'all' ? 'all' : selectedParent === 'root' ? 'root' : selectedParent}
            onChange={(e) => {
              const value = e.target.value
              if (value === 'all') {
                setSelectedParent('all')
              } else if (value === 'root') {
                setSelectedParent('root')
              } else {
                setSelectedParent(Number(value))
              }
            }}
          >
            <option value="all">{t('categories.all')}</option>
            <option value="root">{t('categories.rootOnly')}</option>
            {rootCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : error ? (
        <div className="error">{t('categories.loadError')}</div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}

      {/* Modals */}
      <CreateCategoryModal
        isOpen={showCreateModal}
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
