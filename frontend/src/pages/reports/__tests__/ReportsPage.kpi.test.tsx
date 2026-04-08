import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import {
  useGetDashboardKpiQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardExpenseCategoriesQuery,
  useGetTransferDetailsQuery,
} from '@/shared/api/reportsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/monthPeriodsApi', () => ({
  useGetMonthPeriodQuery: vi.fn(),
}))
vi.mock('@/shared/api/incomeEntriesApi', () => ({
  useListIncomeEntriesQuery: vi.fn(),
}))
vi.mock('@/shared/api/actualExpensesApi', () => ({
  useListActualExpensesQuery: vi.fn(),
}))
vi.mock('@/shared/api/reportsApi', () => ({
  useGetDashboardKpiQuery: vi.fn(),
  useGetDashboardIncomeSourcesQuery: vi.fn(),
  useGetDashboardExpenseCategoriesQuery: vi.fn(),
  useGetTransferDetailsQuery: vi.fn(),
  useExportCashMovementPdfMutation: () => [vi.fn(), {}],
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
    vi.mocked(useGetTransferDetailsQuery).mockClear()
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
    vi.mocked(useGetTransferDetailsQuery).mockReturnValue({
      data: { month: '2026-02', bank_to_cash: [], cash_to_bank: [] },
      isLoading: false,
      error: null,
    } as any)
    vi.mocked(useListIncomeEntriesQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      isError: false,
    } as any)
    vi.mocked(useListActualExpensesQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      isError: false,
    } as any)
  })

  it('renders KPIs from backend dashboard KPI endpoint', async () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-02',
        income_fact: '1000.00',
        expense_fact: '400.00',
        planning_actual_expense_total: '0.00',
        net: '600.00',
        income_plan: '0.00',
        expense_plan: '0.00',
        net_plan: '0.00',
        cash_balance: '0.00',
        bank_balance: '0.00',
        cash_opening_balance: '0.00',
        bank_opening_balance: '0.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '0.00',
        bank_closing_balance: '0.00',
        bank_to_cash_month: '0.00',
        cash_to_bank_month: '0.00',
      },
      isLoading: false,
      error: null,
    } as any)

    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })

    await waitFor(() => {
      // KPI summary: income / expense fact (net is shown in expanded balance block, not main grid)
      expect(screen.getByText(/1\s*000.*сом/)).toBeInTheDocument()
      expect(screen.getByText(/^400 сом$/)).toBeInTheDocument()
    })

    expect(useGetDashboardKpiQuery).toHaveBeenCalledWith({ month: '2026-02' })
  })
})

