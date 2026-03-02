import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddChildModal } from '../AddChildModal'
import { useCreateExpenseCategoryMutation } from '@/shared/api/expenseCategoriesApi'
import type { ExpenseCategory } from '@/shared/api/expenseCategoriesApi'

const mockCreateCategory = vi.fn()

vi.mock('@/shared/api/expenseCategoriesApi', () => ({
  useCreateExpenseCategoryMutation: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const parentCategory: ExpenseCategory = {
  id: 5,
  name: 'Parent Category',
  scope: 'office',
  parent: null,
  parent_id: null,
  is_active: true,
  children_count: 2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('AddChildModal', () => {
  const onClose = vi.fn()
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.mocked(useCreateExpenseCategoryMutation).mockReturnValue([
      mockCreateCategory,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateExpenseCategoryMutation>)
    mockCreateCategory.mockReset()
    onClose.mockClear()
    onSuccess.mockClear()
  })

  it('submit success: calls createCategory with expected payload (name + parent + scope)', async () => {
    mockCreateCategory.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <AddChildModal
        isOpen={true}
        onClose={onClose}
        parent={parentCategory}
        onSuccess={onSuccess}
      />
    )

    const nameInput = screen.getAllByRole('textbox').find((el) => !el.hasAttribute('readOnly'))
    expect(nameInput).toBeTruthy()
    await userEvent.type(nameInput!, 'Child Category Name')

    await userEvent.click(screen.getByRole('button', { name: 'categories.modals.addChild.create' }))

    expect(mockCreateCategory).toHaveBeenCalledTimes(1)
    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'Child Category Name',
      scope: parentCategory.scope,
      parent: parentCategory.id,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error message', async () => {
    mockCreateCategory.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Duplicate name' }),
    })

    render(
      <AddChildModal
        isOpen={true}
        onClose={onClose}
        parent={parentCategory}
      />
    )

    const nameInput = screen.getAllByRole('textbox').find((el) => !el.hasAttribute('readOnly'))
    expect(nameInput).toBeTruthy()
    await userEvent.type(nameInput!, 'Duplicate')
    await userEvent.click(screen.getByRole('button', { name: 'categories.modals.addChild.create' }))

    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'Duplicate',
      scope: 'office',
      parent: 5,
    })
    expect(screen.getAllByText('Duplicate name').length).toBeGreaterThanOrEqual(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
