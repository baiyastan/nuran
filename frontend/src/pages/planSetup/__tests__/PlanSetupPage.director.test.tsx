import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import PlanSetupPage from '../PlanSetupPage'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'
import { useMonthPeriodId } from '@/shared/hooks/useMonthPeriodId'
import {
  useListBudgetPlansQuery,
  useListExpenseCategoriesQuery,
  useListBudgetLinesQuery,
} from '@/shared/api/budgetingApi'

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
    useListExpenseCategoriesQuery: vi.fn(() => emptyQueryResult),
    useListBudgetLinesQuery: vi.fn(() => emptyQueryResult),
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

const basePeriod = {
  periodId: 1,
  isLoading: false,
  error: null,
  monthPeriod: { id: 1, month: '2026-02', status: 'OPEN' },
}

describe('PlanSetupPage – director read-only', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'director' } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useMonthPeriodId).mockReturnValue(basePeriod as unknown as ReturnType<typeof useMonthPeriodId>)
  })

  it('hides create plan when there is no plan', async () => {
    vi.mocked(useListBudgetPlansQuery).mockReturnValue({
      data: { results: [] },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListBudgetPlansQuery>)

    renderWithProviders(
      <Routes>
        <Route path="/plan-setup" element={<PlanSetupPage />} />
      </Routes>,
      { initialEntries: ['/plan-setup?month=2026-02&scope=OFFICE'] }
    )

    await screen.findByText('emptyStateNoPlanLine1')
    expect(screen.queryByRole('button', { name: /actions\.createPlan/i })).toBeNull()
  })

  it('hides save and shows read-only cells when plan exists', async () => {
    vi.mocked(useListBudgetPlansQuery).mockReturnValue({
      data: {
        results: [
          {
            id: 42,
            period: 1,
            period_month: '2026-02',
            scope: 'OFFICE',
            project: null,
            project_name: null,
            status: 'DRAFT',
            submitted_at: null,
            approved_by: null,
            approved_at: null,
            created_at: '',
            updated_at: '',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListBudgetPlansQuery>)

    vi.mocked(useListExpenseCategoriesQuery).mockReturnValue({
      data: {
        results: [
          {
            id: 7,
            name: 'Office cat',
            scope: 'office',
            kind: 'EXPENSE',
            parent: null,
            parent_id: null,
            is_active: true,
            children_count: 0,
            created_at: '',
            updated_at: '',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListExpenseCategoriesQuery>)

    vi.mocked(useListBudgetLinesQuery).mockReturnValue({
      data: {
        results: [
          {
            id: 1,
            plan: 42,
            category: 7,
            category_name: 'Office cat',
            amount_planned: '1500',
            note: '',
            plan_status: 'DRAFT',
            created_at: '',
            updated_at: '',
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useListBudgetLinesQuery>)

    renderWithProviders(
      <Routes>
        <Route path="/plan-setup" element={<PlanSetupPage />} />
      </Routes>,
      { initialEntries: ['/plan-setup?month=2026-02&scope=OFFICE'] }
    )

    await screen.findByText('Office cat')
    expect(screen.queryByRole('button', { name: /actions\.savePlan/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('.plan-setup-readonly--amount')).toBeTruthy()
    expect(document.querySelector('.plan-setup-readonly--comment')).toBeTruthy()
  })
})
