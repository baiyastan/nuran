import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateBudgetLineForm } from '../CreateBudgetLineForm'
import { useCreateBudgetLineMutation } from '@/shared/api/budgetingApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/budgetingApi'

const mockCreateBudgetLine = vi.fn()

vi.mock('@/shared/api/budgetingApi', () => ({
  useCreateBudgetLineMutation: vi.fn(),
  useListExpenseCategoriesQuery: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const minimalLeafCategory = {
  id: 10,
  name: 'Office Supplies',
  scope: 'office' as const,
  kind: 'EXPENSE' as const,
  parent: 1,
  parent_id: 1,
  is_active: true,
  is_system_root: false,
  children_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('CreateBudgetLineForm', () => {
  const planId = 5
  const onSuccess = vi.fn()

  beforeEach(() => {
    vi.mocked(useCreateBudgetLineMutation).mockReturnValue([
      mockCreateBudgetLine,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateBudgetLineMutation>)
    vi.mocked(useListExpenseCategoriesQuery).mockReturnValue({
      data: { results: [minimalLeafCategory] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as ReturnType<typeof useListExpenseCategoriesQuery>)
    mockCreateBudgetLine.mockReset()
    onSuccess.mockClear()
  })

  it('submit success: calls createBudgetLine with expected payload and clears input', async () => {
    mockCreateBudgetLine.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(<CreateBudgetLineForm planId={planId} onSuccess={onSuccess} />)

    const categorySelect = screen.getByRole('combobox')
    await userEvent.selectOptions(categorySelect, '10')
    await userEvent.type(screen.getByRole('spinbutton'), '100.50')
    await userEvent.type(screen.getByRole('textbox'), 'Test note')

    await userEvent.click(screen.getByRole('button', { name: 'expense.form.submit' }))

    expect(mockCreateBudgetLine).toHaveBeenCalledTimes(1)
    expect(mockCreateBudgetLine).toHaveBeenCalledWith({
      plan: planId,
      category: 10,
      amount_planned: 100.5,
      note: 'Test note',
    })

    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('combobox')).toHaveValue('')
    expect(screen.getByRole('spinbutton')).toHaveValue(null)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })

  it('submit error: shows error message (getErrorMessage fallback)', async () => {
    const apiError = { detail: 'Server error' }
    mockCreateBudgetLine.mockReturnValue({
      unwrap: () => Promise.reject(apiError),
    })

    render(<CreateBudgetLineForm planId={planId} />)

    await userEvent.selectOptions(screen.getByRole('combobox'), '10')
    await userEvent.type(screen.getByRole('spinbutton'), '50')
    await userEvent.click(screen.getByRole('button', { name: 'expense.form.submit' }))

    expect(mockCreateBudgetLine).toHaveBeenCalledWith({
      plan: planId,
      category: 10,
      amount_planned: 50,
      note: undefined,
    })

    expect(screen.getByText('Server error')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveValue('10')
  })
})
