import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CreateIncomeEntryModal } from '../CreateIncomeEntryModal'
import { useCreateIncomeEntryMutation } from '@/shared/api/incomeEntriesApi'

const mockCreateIncomeEntry = vi.fn()

vi.mock('@/shared/api/incomeEntriesApi', () => ({
  useCreateIncomeEntryMutation: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

describe('CreateIncomeEntryModal', () => {
  const financePeriodId = 7
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useCreateIncomeEntryMutation).mockReturnValue([
      mockCreateIncomeEntry,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useCreateIncomeEntryMutation>)
    mockCreateIncomeEntry.mockReset()
    onClose.mockClear()
  })

  it('submit success: calls createIncomeEntry with expected payload', async () => {
    mockCreateIncomeEntry.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <CreateIncomeEntryModal
        isOpen={true}
        onClose={onClose}
        financePeriodId={financePeriodId}
      />
    )

    await userEvent.type(screen.getByRole('spinbutton'), '500')
    const receivedAtInput = screen.getByDisplayValue(new RegExp('\\d{4}-\\d{2}-\\d{2}'))
    await userEvent.clear(receivedAtInput)
    await userEvent.type(receivedAtInput, '2026-02-15')
    const textareas = screen.getAllByRole('textbox')
    const commentField = textareas.find((el) => el.getAttribute('rows') === '4') ?? textareas[textareas.length - 1]
    await userEvent.type(commentField, 'Salary')

    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(mockCreateIncomeEntry).toHaveBeenCalledTimes(1)
    expect(mockCreateIncomeEntry).toHaveBeenCalledWith({
      finance_period: financePeriodId,
      amount: 500,
      received_at: '2026-02-15',
      comment: 'Salary',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error text', async () => {
    mockCreateIncomeEntry.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Network error' }),
    })

    render(
      <CreateIncomeEntryModal
        isOpen={true}
        onClose={onClose}
        financePeriodId={financePeriodId}
      />
    )

    await userEvent.type(screen.getByRole('spinbutton'), '100')
    const textareas = screen.getAllByRole('textbox')
    const commentField = textareas.find((el) => el.getAttribute('rows') === '4') ?? textareas[textareas.length - 1]
    await userEvent.type(commentField, 'Comment')

    await userEvent.click(screen.getByRole('button', { name: 'common.create' }))

    expect(mockCreateIncomeEntry).toHaveBeenCalled()
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
