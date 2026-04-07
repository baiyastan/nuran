import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import PlanPeriodDetailsPage from '../PlanPeriodDetailsPage'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useListPlanItemsQuery } from '@/shared/api/planItemsApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/planPeriodsApi', () => ({
  useGetPlanPeriodQuery: vi.fn(),
  useUnlockPlanPeriodMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useReturnPlanPeriodToDraftMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
}))
vi.mock('@/shared/api/monthPeriodsApi', () => ({ useGetMonthPeriodQuery: vi.fn() }))
vi.mock('@/shared/api/planItemsApi', () => ({ useListPlanItemsQuery: vi.fn() }))
vi.mock('@/features/plan-item-create/CreatePlanItemForm', () => ({
  CreatePlanItemForm: () => <div data-testid="create-plan-item-form">form</div>,
}))
vi.mock('@/features/plan-period-submit/SubmitPlanPeriodButton', () => ({
  SubmitPlanPeriodButton: () => <button>Submit for Approval</button>,
}))
vi.mock('@/features/plan-period-approve/ApprovePlanPeriodButton', () => ({
  ApprovePlanPeriodButton: () => <button>Approve / Return</button>,
}))
vi.mock('@/features/plan-period-lock/LockPlanPeriodButton', () => ({
  LockPlanPeriodButton: () => <button>Lock Period</button>,
}))
vi.mock('@/shared/ui/Table/Table', () => ({ Table: () => <div>table</div> }))
vi.mock('@/components/ui/LoadingScreen', () => ({ LoadingScreen: () => <div>loading</div> }))
vi.mock('@/components/ui/TableSkeleton', () => ({ TableSkeleton: () => <div>skeleton</div> }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

function setup({
  role,
  planStatus,
  monthStatus,
}: {
  role: 'admin' | 'director' | 'foreman'
  planStatus: 'draft' | 'submitted' | 'approved' | 'locked'
  monthStatus: 'OPEN' | 'LOCKED'
}) {
  cleanup()
  vi.mocked(useAuth).mockReturnValue({ role } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(useGetPlanPeriodQuery).mockReturnValue({
    data: {
      id: 1,
      fund_kind: 'project',
      project: 10,
      project_name: 'P',
      period: '2026-04',
      status: planStatus,
      submitted_at: null,
      approved_at: null,
      locked_at: null,
      comments: '',
      created_by: 2,
      created_by_username: 'u',
      created_at: '',
      updated_at: '',
    },
    isLoading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetPlanPeriodQuery>)
  vi.mocked(useGetMonthPeriodQuery).mockReturnValue({
    data: monthStatus === 'OPEN' ? { id: 1, month: '2026-04', status: 'OPEN' } : { id: 1, month: '2026-04', status: 'LOCKED' },
  } as unknown as ReturnType<typeof useGetMonthPeriodQuery>)
  vi.mocked(useListPlanItemsQuery).mockReturnValue({
    data: { results: [] },
    isLoading: false,
  } as unknown as ReturnType<typeof useListPlanItemsQuery>)

  renderWithProviders(
    <Routes>
      <Route path="/plan-periods/:id" element={<PlanPeriodDetailsPage />} />
    </Routes>,
    { initialEntries: ['/plan-periods/1'] }
  )
}

describe('PlanPeriodDetailsPage workflow visibility', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows create item form only for draft + month open + allowed role', async () => {
    setup({ role: 'foreman', planStatus: 'draft', monthStatus: 'OPEN' })
    expect(await screen.findByTestId('create-plan-item-form')).toBeInTheDocument()

    setup({ role: 'foreman', planStatus: 'submitted', monthStatus: 'OPEN' })
    expect(screen.queryByTestId('create-plan-item-form')).toBeNull()
  })

  it('shows submit only for foreman in draft + open month', async () => {
    setup({ role: 'foreman', planStatus: 'draft', monthStatus: 'OPEN' })
    expect(await screen.findByRole('button', { name: 'Submit for Approval' })).toBeInTheDocument()

    setup({ role: 'admin', planStatus: 'draft', monthStatus: 'OPEN' })
    expect(screen.queryByRole('button', { name: 'Submit for Approval' })).toBeNull()
  })

  it('shows approve only for director/admin in submitted + open month', async () => {
    setup({ role: 'director', planStatus: 'submitted', monthStatus: 'OPEN' })
    expect(await screen.findByRole('button', { name: 'Approve / Return' })).toBeInTheDocument()

    setup({ role: 'foreman', planStatus: 'submitted', monthStatus: 'OPEN' })
    expect(screen.queryByRole('button', { name: 'Approve / Return' })).toBeNull()
  })

  it('shows lock only for admin in approved + open month', async () => {
    setup({ role: 'admin', planStatus: 'approved', monthStatus: 'OPEN' })
    expect(await screen.findByRole('button', { name: 'Lock Period' })).toBeInTheDocument()

    setup({ role: 'director', planStatus: 'approved', monthStatus: 'OPEN' })
    expect(screen.queryByRole('button', { name: 'Lock Period' })).toBeNull()
  })

  it('hides unlock when month is locked', async () => {
    setup({ role: 'admin', planStatus: 'locked', monthStatus: 'LOCKED' })
    expect(screen.queryByRole('button', { name: 'Unlock Period' })).toBeNull()
  })

  it('shows return to draft only for director/admin in submitted or approved + open month', async () => {
    setup({ role: 'director', planStatus: 'submitted', monthStatus: 'OPEN' })
    expect(await screen.findByRole('button', { name: 'Return to Draft' })).toBeInTheDocument()

    setup({ role: 'foreman', planStatus: 'approved', monthStatus: 'OPEN' })
    expect(screen.queryByRole('button', { name: 'Return to Draft' })).toBeNull()
  })
})
