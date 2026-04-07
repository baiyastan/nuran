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
vi.mock('@/shared/api/budgetingApi', () => ({
  useListBudgetPlansQuery: vi.fn(),
  useListExpenseCategoriesQuery: vi.fn(),
  useListBudgetLinesQuery: vi.fn(),
  useCreateBudgetPlanMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useBulkUpsertBudgetLinesMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ru', resolvedLanguage: 'ru' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

const basePeriod = {
  periodId: 1,
  isLoading: false,
  error: null,
  monthPeriod: {
    id: 1,
    month: '2026-02',
    status: 'OPEN',
    planning_open: true,
    planning_opened_at: null,
    planning_closed_at: null,
  },
}

function setup(status: 'OPEN' | 'SUBMITTED' | 'APPROVED') {
  vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(useMonthPeriodId).mockReturnValue(basePeriod as unknown as ReturnType<typeof useMonthPeriodId>)
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
          status,
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
          is_system_root: false,
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
    data: { results: [] },
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
}

describe('PlanSetupPage budget status workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('allows editing for OPEN', async () => {
    setup('OPEN')
    expect(await screen.findByRole('button', { name: /actions\.savePlan/i })).toBeInTheDocument()
  })

  it('is read-only for SUBMITTED', async () => {
    setup('SUBMITTED')
    expect(await screen.findByText('Office cat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions\.savePlan/i })).toBeNull()
  })

  it('is read-only for APPROVED', async () => {
    setup('APPROVED')
    expect(await screen.findByText('Office cat')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions\.savePlan/i })).toBeNull()
  })
})
