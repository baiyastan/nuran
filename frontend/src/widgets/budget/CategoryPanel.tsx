import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { Button } from '@/shared/ui/Button/Button'
import './CategoryPanel.css'

interface CategoryPanelProps {
  onCategorySelect: (categoryId: number) => void
  selectedCategoryId?: number | null
  scope?: 'project' | 'office' | 'charity'
}

export function CategoryPanel({ onCategorySelect, selectedCategoryId, scope = 'project' }: CategoryPanelProps) {
  const { t } = useTranslation()
  const [selectedRootId, setSelectedRootId] = useState<number | null>(null)

  // Fetch root categories
  const { data: rootCategoriesData } = useListExpenseCategoriesQuery({
    scope,
    parent: null,
    is_active: true,
    is_system_root: true,
    ordering: 'created_at', // Order by created_at ASC for roots
  })

  // Fetch children of selected root
  const { data: childrenData } = useListExpenseCategoriesQuery(
    {
      parent: selectedRootId || undefined,
      scope,
      is_active: true,
      ordering: 'name', // Order by name ASC for children
    },
    { skip: !selectedRootId }
  )

  const handleRootSelect = (rootId: number) => {
    setSelectedRootId(rootId)
  }

  const handleCategoryClick = (categoryId: number) => {
    onCategorySelect(categoryId)
  }

  return (
    <div className="category-panel">
      <div className="category-panel-section">
        <h4>{t('categories.panel.rootCategories')}</h4>
        {rootCategoriesData?.results.length === 0 ? (
          <div className="empty-state">{t('categories.panel.noRootCategories')}</div>
        ) : (
          <div className="category-buttons">
            {rootCategoriesData?.results.map((category) => (
              <Button
                key={category.id}
                variant={selectedRootId === category.id ? 'primary' : 'secondary'}
                size="small"
                onClick={() => handleRootSelect(category.id)}
              >
                {category.name} ({category.scope === 'project' ? t('categories.project') : t('categories.office')})
              </Button>
            ))}
          </div>
        )}
      </div>

      {selectedRootId && (
        <div className="category-panel-section">
          <h4>{t('categories.panel.subcategories')}</h4>
          {childrenData?.results.length === 0 ? (
            <div className="empty-state">{t('categories.panel.noSubcategories')}</div>
          ) : (
            <div className="category-list">
              {childrenData?.results.map((category) => (
                <div
                  key={category.id}
                  className={`category-item ${selectedCategoryId === category.id ? 'selected' : ''}`}
                  onClick={() => handleCategoryClick(category.id)}
                >
                  {category.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

