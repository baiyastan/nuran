import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import { Button } from '@/shared/ui/Button/Button'
import { AddRootModal } from '@/features/category-admin/AddRootModal'
import { AddChildModal } from '@/features/category-admin/AddChildModal'
import { EditCategoryModal } from '@/features/category-admin/EditCategoryModal'
import { DeactivateCategoryModal } from '@/features/category-admin/DeactivateCategoryModal'
import './CategoriesPage.css'

function CategoriesPage() {
  const { t } = useTranslation()
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showAddRootModal, setShowAddRootModal] = useState(false)
  const [showAddChildModal, setShowAddChildModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ExpenseCategory | null>(null)
  const [deactivatingCategory, setDeactivatingCategory] = useState<ExpenseCategory | null>(null)

  // Fetch root categories
  const { data: rootCategoriesData, refetch: refetchRoots } = useListExpenseCategoriesQuery({
    parent: null,
    is_active: showInactive ? undefined : true,
    ordering: 'created_at', // Order by created_at ASC for roots
  })

  // Fetch children of selected root
  const { data: childrenData, refetch: refetchChildren } = useListExpenseCategoriesQuery(
    {
      parent: selectedRootId || undefined,
      is_active: showInactive ? undefined : true,
      ordering: 'name', // Order by name ASC for children
    },
    { skip: !selectedRootId }
  )

  const selectedRoot = rootCategoriesData?.results.find((cat) => cat.id === selectedRootId) || null

  const handleRootSelect = (rootId: number) => {
    setSelectedRootId(rootId)
  }

  const handleRefresh = () => {
    refetchRoots()
    if (selectedRootId) {
      refetchChildren()
    }
  }

  const handleAddRootSuccess = () => {
    handleRefresh()
  }

  const handleAddChildSuccess = () => {
    handleRefresh()
  }

  const handleEditSuccess = () => {
    handleRefresh()
    setEditingCategory(null)
  }

  const handleDeactivateSuccess = () => {
    handleRefresh()
    setDeactivatingCategory(null)
    // If deactivated category was selected, clear selection
    if (deactivatingCategory?.id === selectedRootId) {
      setSelectedRootId(null)
    }
  }

  return (
    <div className="categories-page">
      <div className="page-header">
        <h2>{t('categories.title')}</h2>
        <div className="header-actions">
          <label className="toggle-inactive">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            {t('categories.showInactive')}
          </label>
          <Button onClick={() => setShowAddRootModal(true)}>{t('categories.addRoot')}</Button>
          <Button
            onClick={() => setShowAddChildModal(true)}
            disabled={!selectedRootId}
            variant="secondary"
          >
            {t('categories.addChild')}
          </Button>
        </div>
      </div>

      <div className="categories-layout">
        {/* Left Column: Root Categories */}
        <div className="categories-column">
          <h3>{t('categories.rootTitle')}</h3>
          {rootCategoriesData?.results.length === 0 ? (
            <div className="empty-state">{t('categories.noRootCategories')}</div>
          ) : (
            <ul className="category-list">
              {rootCategoriesData?.results.map((category) => (
                <li
                  key={category.id}
                  className={`category-item ${selectedRootId === category.id ? 'selected' : ''} ${!category.is_active ? 'inactive' : ''}`}
                  onClick={() => handleRootSelect(category.id)}
                >
                  <div className="category-item-content">
                    <span className="category-name">{category.name}</span>
                    <span className="category-scope">{category.scope}</span>
                    {!category.is_active && (
                      <span className="category-status">({t('categories.inactive')})</span>
                    )}
                  </div>
                  <div className="category-item-actions" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setEditingCategory(category)}
                    >
                      {t('categories.edit')}
                    </Button>
                    {category.is_active && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setDeactivatingCategory(category)}
                      >
                        {t('categories.deactivate')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right Column: Children of Selected Root */}
        <div className="categories-column">
          <h3>
            {selectedRoot ? `${t('categories.childrenTitle')} "${selectedRoot.name}"` : t('categories.selectRoot')}
          </h3>
          {!selectedRootId ? (
            <div className="empty-state">{t('categories.selectRootHint')}</div>
          ) : childrenData?.results.length === 0 ? (
            <div className="empty-state">{t('categories.noChildren')}</div>
          ) : (
            <ul className="category-list">
              {childrenData?.results.map((category) => (
                <li
                  key={category.id}
                  className={`category-item ${!category.is_active ? 'inactive' : ''}`}
                >
                  <div className="category-item-content">
                    <span className="category-name">{category.name}</span>
                    <span className="category-scope">{category.scope}</span>
                    {!category.is_active && (
                      <span className="category-status">({t('categories.inactive')})</span>
                    )}
                  </div>
                  <div className="category-item-actions">
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => setEditingCategory(category)}
                    >
                      {t('categories.edit')}
                    </Button>
                    {category.is_active && (
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={() => setDeactivatingCategory(category)}
                      >
                        {t('categories.deactivate')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Modals */}
      <AddRootModal
        isOpen={showAddRootModal}
        onClose={() => setShowAddRootModal(false)}
        onSuccess={handleAddRootSuccess}
      />

      <AddChildModal
        isOpen={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
        parent={selectedRoot}
        onSuccess={handleAddChildSuccess}
      />

      <EditCategoryModal
        isOpen={!!editingCategory}
        onClose={() => setEditingCategory(null)}
        category={editingCategory}
        onSuccess={handleEditSuccess}
      />

      <DeactivateCategoryModal
        isOpen={!!deactivatingCategory}
        onClose={() => setDeactivatingCategory(null)}
        category={deactivatingCategory}
        onSuccess={handleDeactivateSuccess}
      />
    </div>
  )
}

export default CategoriesPage

