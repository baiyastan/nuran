import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import PlanSetupPage from '../PlanSetupPage'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'
import { useMonthPeriodId } from '@/shared/hooks/useMonthPeriodId'
import { useListBudgetPlansQuery } from '@/shared/api/budgetingApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/hooks/useMonthPeriodId', () => ({ useMonthPeriodId: vi.fn() }))
vi.mock('@/shared/api/budgetingApi', () => {
  const emptyQueryResult = {
    data: { results: [] },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  }
  return {
    useListBudgetPlansQuery: vi.fn(),
    useListExpenseCategoriesQuery: () => emptyQueryResult,
    useListBudgetLinesQuery: () => emptyQueryResult,
    useCreateBudgetPlanMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
    useBulkUpsertBudgetLinesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'ru', resolvedLanguage: 'ru' },
  }),
}))

vi.mock('@/features/month-gate/MonthGateBanner', () => ({
  MonthGateBanner: () => null,
}))

describe('PlanSetupPage (real) – admin', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useMonthPeriodId).mockReturnValue({
      periodId: 1,
      isLoading: false,
      error: null,
      monthPeriod: { id: 1, month: '2026-02', status: 'OPEN' },
    } as unknown as ReturnType<typeof useMonthPeriodId>)
    vi.mocked(useListBudgetPlansQuery).mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListBudgetPlansQuery>)
  })

  it('admin scope select has 3 options: OFFICE, PROJECT, CHARITY', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/plan-setup" element={<PlanSetupPage />} />
      </Routes>,
      { initialEntries: ['/plan-setup?month=2026-02&scope=OFFICE'] }
    )
    const scopeSelect = await screen.findByRole('combobox', { name: /fields\.scope/i })
    const options = Array.from(scopeSelect.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual(['OFFICE', 'PROJECT', 'CHARITY'])
  })
})
