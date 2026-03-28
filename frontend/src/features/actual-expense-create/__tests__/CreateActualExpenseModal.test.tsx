import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateActualExpenseModal } from '../CreateActualExpenseModal'
import { useCreateActualExpenseMutation } from '@/shared/api/actualExpensesApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'

const mockCreate = vi.fn()

vi.mock('@/shared/api/actualExpensesApi', () => ({
  useCreateActualExpenseMutation: vi.fn(),
}))

vi.mock('@/shared/api/expenseCategoriesApi', () => ({
  useListExpenseCategoriesQuery: vi.fn(),
}))

const tSpy = vi.fn((key: string, opts?: Record<string, string>) => {
  if (key === 'expenses.form.errors.insufficientBalance.cash') {
    return `KG_CASH ${opts?.available ?? ''} ${opts?.entered ?? ''}`
  }
  if (key === 'expenses.form.errors.insufficientBalance.bank') {
    return `KG_BANK ${opts?.available ?? ''} ${opts?.entered ?? ''}`
  }
  if (key === 'expenses.form.errors.insufficientBalanceHint') return 'KG_HINT'
  if (key === 'expenses.form.errors.insufficientBalanceAmountField') return 'KG_AMOUNT_FIELD'
  if (key === 'errors.api.badRequest') return 'FRIENDLY_BAD_REQUEST'
  return key
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: tSpy, i18n: { language: 'ky' } }),
}))

describe('CreateActualExpenseModal API errors', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useListExpenseCategoriesQuery).mockReturnValue({
      data: [
        {
          id: 50,
          name: 'Test leaf',
          parent: 1,
          parent_id: 1,
          children_count: 0,
        },
      ],
      isLoading: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListExpenseCategoriesQuery>)

    vi.mocked(useCreateActualExpenseMutation).mockReturnValue([
      mockCreate,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateActualExpenseMutation>)

    mockCreate.mockReset()
    onClose.mockClear()
    tSpy.mockClear()
  })

  async function fillValidForm() {
    await userEvent.type(screen.getByPlaceholderText('expenses.form.selectCategory'), 'Test')
    await userEvent.click(screen.getByText('Test leaf'))
    await userEvent.type(screen.getByRole('spinbutton'), '100000')
    const textareas = screen.getAllByRole('textbox')
    const comment =
      textareas.find((el) => el.tagName === 'TEXTAREA') ?? textareas[textareas.length - 1]
    await userEvent.type(comment, 'Comment text')
  }

  it('insufficient balance on Cash: shows localized block and amount field error', async () => {
    mockCreate.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: { amount: ['Insufficient balance on Cash. Available: 22000.00.'] },
          error: 'Request failed with status code 400',
        }),
    })

    render(
      <CreateActualExpenseModal isOpen={true} onClose={onClose} month="2026-03" scope="OFFICE" />
    )

    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(screen.getByText(/KG_CASH/)).toBeInTheDocument()
    expect(screen.getByText('KG_HINT')).toBeInTheDocument()
    expect(screen.getByText('KG_AMOUNT_FIELD')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('insufficient balance on Bank: uses bank copy', async () => {
    mockCreate.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: { amount: ['Insufficient balance on Bank. Available: 100.00.'] },
          error: 'Request failed with status code 400',
        }),
    })

    render(
      <CreateActualExpenseModal isOpen={true} onClose={onClose} month="2026-03" scope="OFFICE" />
    )

    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(screen.getByText(/KG_BANK/)).toBeInTheDocument()
  })

  it('generic 400 without field body: shows friendly badRequest message', async () => {
    mockCreate.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: {},
          error: 'Request failed with status code 400',
        }),
    })

    render(
      <CreateActualExpenseModal isOpen={true} onClose={onClose} month="2026-03" scope="OFFICE" />
    )

    await fillValidForm()
    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(screen.getByText('FRIENDLY_BAD_REQUEST')).toBeInTheDocument()
  })
})
