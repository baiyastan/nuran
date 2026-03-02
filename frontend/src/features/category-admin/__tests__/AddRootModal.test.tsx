import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AddRootModal } from '../AddRootModal'
import { useCreateExpenseCategoryMutation } from '@/shared/api/expenseCategoriesApi'

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

describe('AddRootModal', () => {
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

  it('submit success: calls createCategory with expected payload and closes modal', async () => {
    mockCreateCategory.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <AddRootModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    )

    await userEvent.type(screen.getByRole('textbox'), 'New Root Category')
    await userEvent.selectOptions(screen.getByRole('combobox'), 'office')

    await userEvent.click(screen.getByRole('button', { name: 'categories.modals.addRoot.create' }))

    expect(mockCreateCategory).toHaveBeenCalledTimes(1)
    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'New Root Category',
      scope: 'office',
      parent: null,
    })
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error', async () => {
    mockCreateCategory.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Category already exists' }),
    })

    render(
      <AddRootModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    )

    await userEvent.type(screen.getByRole('textbox'), 'Duplicate')
    await userEvent.click(screen.getByRole('button', { name: 'categories.modals.addRoot.create' }))

    expect(mockCreateCategory).toHaveBeenCalledWith({
      name: 'Duplicate',
      scope: 'project',
      parent: null,
    })
    expect(screen.getAllByText('Category already exists').length).toBeGreaterThanOrEqual(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
