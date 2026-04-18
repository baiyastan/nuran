import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditIncomeEntryModal } from '../EditIncomeEntryModal'
import { useUpdateIncomeEntryMutation } from '@/shared/api/incomeEntriesApi'
import type { IncomeEntry } from '@/entities/income-entry/model'

const mockUpdateIncomeEntry = vi.fn()

vi.mock('@/shared/api/incomeEntriesApi', () => ({
  useUpdateIncomeEntryMutation: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

const minimalIncomeEntry: IncomeEntry = {
  id: 42,
  finance_period: 1,
  finance_period_fund_kind: 'office',
  finance_period_month: '2026-02',
  project_name: null,
  account: 'CASH',
  currency: 'KGS',
  amount: '200.00',
  received_at: '2026-02-10T00:00:00Z',
  comment: 'Initial comment',
  created_by: 1,
  created_by_username: 'user',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
}

describe('EditIncomeEntryModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.mocked(useUpdateIncomeEntryMutation).mockReturnValue([
      mockUpdateIncomeEntry,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useUpdateIncomeEntryMutation>)
    mockUpdateIncomeEntry.mockReset()
    onClose.mockClear()
  })

  it('submit success: calls updateIncomeEntry with expected payload', async () => {
    mockUpdateIncomeEntry.mockReturnValue({ unwrap: () => Promise.resolve() })

    render(
      <EditIncomeEntryModal
        isOpen={true}
        onClose={onClose}
        incomeEntry={minimalIncomeEntry}
      />
    )

    await userEvent.clear(screen.getByRole('spinbutton'))
    await userEvent.type(screen.getByRole('spinbutton'), '350')
    const textareas = screen.getAllByRole('textbox')
    const commentField = textareas.find((el) => el.getAttribute('rows') === '4') ?? textareas[textareas.length - 1]
    await userEvent.clear(commentField)
    await userEvent.type(commentField, 'Updated comment')

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(mockUpdateIncomeEntry).toHaveBeenCalledTimes(1)
    expect(mockUpdateIncomeEntry).toHaveBeenCalledWith({
      id: minimalIncomeEntry.id,
      data: {
        amount: 350,
        received_at: '2026-02-10',
        comment: 'Updated comment',
        account: 'CASH',
        currency: 'KGS',
      },
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('submit error: shows error message', async () => {
    mockUpdateIncomeEntry.mockReturnValue({
      unwrap: () => Promise.reject({ detail: 'Validation failed' }),
    })

    render(
      <EditIncomeEntryModal
        isOpen={true}
        onClose={onClose}
        incomeEntry={minimalIncomeEntry}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'common.save' }))

    expect(mockUpdateIncomeEntry).toHaveBeenCalled()
    expect(screen.getByText('Validation failed')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
