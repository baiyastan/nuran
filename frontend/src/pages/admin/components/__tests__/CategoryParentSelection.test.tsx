import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreateCategoryModal } from '../CreateCategoryModal'
import { EditCategoryModal } from '../EditCategoryModal'
import {
  useCreateExpenseCategoryMutation,
  useListExpenseCategoriesQuery,
  useUpdateExpenseCategoryMutation,
  type ExpenseCategory,
} from '@/shared/api/expenseCategoriesApi'

vi.mock('@/shared/api/expenseCategoriesApi', () => ({
  useCreateExpenseCategoryMutation: vi.fn(),
  useListExpenseCategoriesQuery: vi.fn(),
  useUpdateExpenseCategoryMutation: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ru' },
  }),
}))

const mockCreateCategory = vi.fn()
const mockUpdateCategory = vi.fn()

const systemRoot: ExpenseCategory = {
  id: 1,
  name: 'Офис расходы',
  scope: 'office',
  parent: null,
  parent_id: null,
  is_active: true,
  is_system_root: true,
  children_count: 1,
  created_at: '',
  updated_at: '',
}

const ordinaryChild: ExpenseCategory = {
  id: 2,
  name: 'Ordinary child',
  scope: 'office',
  parent: 1,
  parent_id: 1,
  is_active: true,
  is_system_root: false,
  children_count: 0,
  created_at: '',
  updated_at: '',
}

describe('Category parent selection guards', () => {
  beforeEach(() => {
    vi.mocked(useCreateExpenseCategoryMutation).mockReturnValue([
      mockCreateCategory,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateExpenseCategoryMutation>)
    vi.mocked(useUpdateExpenseCategoryMutation).mockReturnValue([
      mockUpdateCategory,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useUpdateExpenseCategoryMutation>)
    vi.mocked(useListExpenseCategoriesQuery).mockReturnValue({
      data: { results: [ordinaryChild, systemRoot] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListExpenseCategoriesQuery>)
  })

  it('create modal shows only system root parent option and auto-selects it', () => {
    render(
      <CreateCategoryModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        scope="office"
      />
    )

    expect(screen.getByText('Офис расходы (системный root)')).toBeInTheDocument()
    expect(screen.queryByText('Ordinary child')).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('edit modal excludes ordinary child categories from parent options', () => {
    render(
      <EditCategoryModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        category={ordinaryChild}
      />
    )

    expect(screen.getByText('Офис расходы (системный root)')).toBeInTheDocument()
    expect(screen.queryByText('Ordinary child')).toBeNull()
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})
