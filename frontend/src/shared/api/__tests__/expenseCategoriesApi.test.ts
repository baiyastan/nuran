import { describe, expect, it } from 'vitest'
import { normalizeExpenseCategoryListResponse, type ExpenseCategory } from '@/shared/api/expenseCategoriesApi'

const sampleCategory: ExpenseCategory = {
  id: 1,
  name: 'Category',
  scope: 'office',
  parent: null,
  parent_id: null,
  is_active: true,
  is_system_root: true,
  children_count: 0,
  created_at: '',
  updated_at: '',
}

describe('normalizeExpenseCategoryListResponse', () => {
  it('keeps paginated shape unchanged', () => {
    const paginated = {
      count: 1,
      next: null,
      previous: null,
      results: [sampleCategory],
    }
    expect(normalizeExpenseCategoryListResponse(paginated)).toEqual(paginated)
  })

  it('normalizes plain array into list envelope', () => {
    const result = normalizeExpenseCategoryListResponse([sampleCategory, { ...sampleCategory, id: 2 }])
    expect(result.count).toBe(2)
    expect(result.next).toBeNull()
    expect(result.previous).toBeNull()
    expect(result.results).toHaveLength(2)
  })
})
