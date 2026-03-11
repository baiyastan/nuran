import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import {
  useGetDashboardKpiQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardExpenseCategoriesQuery,
} from '@/shared/api/reportsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/monthPeriodsApi', () => ({
  useGetMonthPeriodQuery: vi.fn(),
}))
vi.mock('@/shared/api/reportsApi', () => ({
  useGetDashboardKpiQuery: vi.fn(),
  useGetDashboardIncomeSourcesQuery: vi.fn(),
  useGetDashboardExpenseCategoriesQuery: vi.fn(),
  // Export mutations as no-op tuples to satisfy GlobalSummary
  useExportSectionPdfMutation: () => [vi.fn(), {}],
  useExportIncomeSourceDetailPdfMutation: () => [vi.fn(), {}],
  useExportExpenseCategoryDetailPdfMutation: () => [vi.fn(), {}],
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – dashboard KPIs', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useGetDashboardKpiQuery).mockClear()
    vi.mocked(useGetDashboardIncomeSourcesQuery).mockClear()
    vi.mocked(useGetDashboardExpenseCategoriesQuery).mockClear()
    vi.mocked(useGetMonthPeriodQuery).mockClear()
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as unknown as ReturnType<typeof useAuth>)

    // Default successful responses for hooks that GlobalSummary and ReportsPage rely on
    vi.mocked(useGetMonthPeriodQuery).mockReturnValue({
      data: {
        id: 1,
        month: '2026-02',
        status: 'OPEN',
        created_at: '',
        updated_at: '',
      },
      isLoading: false,
      error: undefined,
      isError: false,
    } as any)
    vi.mocked(useGetDashboardIncomeSourcesQuery).mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(useGetDashboardExpenseCategoriesQuery).mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      error: null,
    } as any)
  })

  it('renders KPIs from backend dashboard KPI endpoint', async () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-02',
        income_fact: 1000,
        expense_fact: 400,
        net: 600,
      },
      isLoading: false,
      error: null,
    } as any)

    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })

    await waitFor(() => {
      // Values are formatted as localized KGS amounts, e.g. "1 000 сом"
      expect(screen.getByText(/1\s*000.*сом/)).toBeInTheDocument()
      expect(screen.getByText(/400.*сом/)).toBeInTheDocument()
      expect(screen.getByText(/600.*сом/)).toBeInTheDocument()
    })

    expect(useGetDashboardKpiQuery).toHaveBeenCalledWith({ month: '2026-02' })
  })
})

