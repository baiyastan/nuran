import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IncomePlanModal } from '../IncomePlanModal'
import { useCreateIncomePlanMutation, useUpdateIncomePlanMutation } from '@/shared/api/incomePlansApi'
import { useListIncomeSourcesQuery } from '@/shared/api/incomeSourcesApi'
import { useCreateMonthPeriodMutation } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/api/incomePlansApi', () => ({
  useCreateIncomePlanMutation: vi.fn(),
  useUpdateIncomePlanMutation: vi.fn(),
}))

vi.mock('@/shared/api/incomeSourcesApi', () => ({
  useListIncomeSourcesQuery: vi.fn(),
}))

vi.mock('@/shared/api/monthPeriodsApi', () => ({
  useCreateMonthPeriodMutation: vi.fn(),
}))

vi.mock('@/shared/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

describe('IncomePlanModal', () => {
  const createMockQueryResult = <T,>(data: T) =>
    ({
      data,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: undefined,
      refetch: vi.fn(),
    }) as const

  beforeEach(() => {
    vi.mocked(useCreateIncomePlanMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as unknown as ReturnType<typeof useCreateIncomePlanMutation>)
    vi.mocked(useUpdateIncomePlanMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as unknown as ReturnType<typeof useUpdateIncomePlanMutation>)
    vi.mocked(useCreateMonthPeriodMutation).mockReturnValue([
      vi.fn(),
      { isLoading: false },
    ] as unknown as ReturnType<typeof useCreateMonthPeriodMutation>)
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as ReturnType<typeof useAuth>)
    vi.mocked(useListIncomeSourcesQuery).mockReturnValue(
      createMockQueryResult([
        { id: 1, name: 'Source A', is_active: true },
        { id: 2, name: 'Source B', is_active: true },
      ]) as unknown as ReturnType<typeof useListIncomeSourcesQuery>
    )
  })

  it('create mode hides already used sources', () => {
    render(
      <IncomePlanModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        year={2026}
        month={3}
        usedSourceIds={[1]}
      />
    )

    const options = screen.getAllByRole('option')
    expect(options.some((option) => option.textContent === 'Source A')).toBe(false)
    expect(options.some((option) => option.textContent === 'Source B')).toBe(true)
  })

  it('edit mode keeps current source selectable', () => {
    render(
      <IncomePlanModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        year={2026}
        month={3}
        usedSourceIds={[1, 2]}
        plan={{
          id: 10,
          year: 2026,
          month: 3,
          source: { id: 1, name: 'Source A', is_active: true },
          source_id: 1,
          amount: '300000.00',
          created_at: '2026-03-01T00:00:00Z',
          updated_at: '2026-03-01T00:00:00Z',
        }}
      />
    )

    const options = screen.getAllByRole('option')
    expect(options.some((option) => option.textContent === 'Source A')).toBe(true)
    expect(options.some((option) => option.textContent === 'Source B')).toBe(true)
  })

  it('create mode shows message and disables create when all sources are used', () => {
    render(
      <IncomePlanModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        year={2026}
        month={3}
        usedSourceIds={[1, 2]}
      />
    )

    expect(
      screen.getByText('incomePlan.noAvailableSources')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'create' })).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'incomePlan.editInstead' })).toBeInTheDocument()
  })

  it('edit instead closes modal and calls callback', async () => {
    const onClose = vi.fn()
    const onEditExistingPlan = vi.fn()
    render(
      <IncomePlanModal
        isOpen={true}
        onClose={onClose}
        onSuccess={vi.fn()}
        onEditExistingPlan={onEditExistingPlan}
        year={2026}
        month={3}
        usedSourceIds={[1, 2]}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'incomePlan.editInstead' }))
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(onEditExistingPlan).toHaveBeenCalledTimes(1)
    })
  })
})
