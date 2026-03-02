import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useListExpenseCategoriesQuery, ExpenseCategory } from '@/shared/api/expenseCategoriesApi'
import './CategorySidebar.css'

interface CategorySidebarProps {
  scope: 'office' | 'project' | 'charity'
}

interface CategoryNode extends ExpenseCategory {
  children: CategoryNode[]
}

function CategorySidebar({ scope }: CategorySidebarProps) {
  const { t } = useTranslation('reports')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)

  // Fetch all categories for the scope
  const { data: categoriesData } = useListExpenseCategoriesQuery({
    scope,
    is_active: true,
  })

  const categories = useMemo(() => categoriesData?.results ?? [], [categoriesData])

  // Build tree structure
  const categoryTree = useMemo(() => {
    const buildTree = (items: ExpenseCategory[]): CategoryNode[] => {
      const map = new Map<number, CategoryNode>()
      const roots: CategoryNode[] = []

      // Create map with children array
      items.forEach((cat) => {
        map.set(cat.id, { ...cat, children: [] })
      })

      // Build tree
      items.forEach((cat) => {
        const node = map.get(cat.id)!
        if (cat.parent_id === null) {
          roots.push(node)
        } else {
          const parent = map.get(cat.parent_id)
          if (parent) {
            parent.children.push(node)
          }
        }
      })

      // Sort roots and children
      roots.sort((a, b) => a.name.localeCompare(b.name))
      map.forEach((node) => {
        node.children.sort((a, b) => a.name.localeCompare(b.name))
      })

      return roots
    }

    return buildTree(categories)
  }, [categories])

  const toggleExpand = (categoryId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleCategoryClick = (categoryId: number | null) => {
    // Visual-only: just update local state
    setSelectedCategoryId(categoryId)
  }

  const renderCategoryNode = (node: CategoryNode, level: number = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)
    const isSelected = selectedCategoryId === node.id

    return (
      <div key={node.id} className="category-node">
        <div
          className={`category-item ${isSelected ? 'selected' : ''}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
        >
          {hasChildren && (
            <button
              type="button"
              className="category-expand-btn"
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(node.id)
              }}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span className="category-expand-spacer" />}
          <button
            type="button"
            className="category-name-btn"
            onClick={() => handleCategoryClick(node.id)}
          >
            {node.name}
          </button>
        </div>
        {hasChildren && isExpanded && (
          <div className="category-children">
            {node.children.map((child) => renderCategoryNode(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="category-sidebar">
      <h3 className="category-sidebar-title">{t('categories.title') || 'Categories'}</h3>
      <div className="category-list">
        <button
          type="button"
          className={`category-item ${selectedCategoryId === null ? 'selected' : ''}`}
          onClick={() => handleCategoryClick(null)}
        >
          <span className="category-expand-spacer" />
          <span className="category-name-btn">{t('categories.all') || 'All categories'}</span>
        </button>
        {categoryTree.map((node) => renderCategoryNode(node))}
      </div>
    </div>
  )
}

export default CategorySidebar

