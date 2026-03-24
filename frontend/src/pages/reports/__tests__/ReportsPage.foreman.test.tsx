import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useGetMonthlyReportQuery } from '@/shared/api/reportsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/monthPeriodsApi', () => ({
  useGetMonthPeriodQuery: vi.fn(),
}))
vi.mock('@/shared/api/reportsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/reportsApi')>()
  return {
    ...actual,
    useGetMonthlyReportQuery: vi.fn(),
  }
})
vi.mock('@/shared/api/actualExpensesApi', () => ({
  useListActualExpensesQuery: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

const monthlyEmpty = {
  month: '2026-02',
  scope: 'PROJECT',
  plan_id: null,
  facts: { count: 0, total_actual: 0, uncategorized_count: 0 },
  totals: { planned: 0, actual: 0, delta: 0, percent: 0 },
  rows: [],
  uncategorized: { planned: 0, actual: 0, delta: 0 },
}

describe('ReportsPage – foreman', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
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
    } as ReturnType<typeof useGetMonthPeriodQuery>)
    vi.mocked(useGetMonthlyReportQuery).mockReturnValue({
      data: monthlyEmpty,
      isLoading: false,
      isFetching: false,
      error: undefined,
      isError: false,
    } as ReturnType<typeof useGetMonthlyReportQuery>)
    vi.mocked(useListActualExpensesQuery).mockReturnValue({
      data: { results: [], count: 0, next: null, previous: null },
      isLoading: false,
      error: undefined,
      isError: false,
    } as ReturnType<typeof useListActualExpensesQuery>)
  })

  it('renders project expense report instead of global summary for foreman', () => {
    renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.queryByText('expense.title')).not.toBeInTheDocument()
    expect(screen.getByText('expense.summaryTitle')).toBeInTheDocument()
    expect(screen.queryByText('globalSummary.title')).not.toBeInTheDocument()
  })

  it('strips tab and scope from URL for foreman', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).not.toContain('tab=')
      expect(search).not.toContain('scope=')
      expect(search).toContain('month=2026-02')
    })
  })

  it('strips invalid tab/scope from URL for foreman', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).not.toContain('tab=')
      expect(search).not.toContain('scope=')
    })
  })
})
