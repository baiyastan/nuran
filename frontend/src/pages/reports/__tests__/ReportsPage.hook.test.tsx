import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/monthPeriodsApi', () => ({
  useGetMonthPeriodQuery: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – month-period hook', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useGetMonthPeriodQuery).mockClear()
    // Default happy-path month period result so destructuring in ReportsPage never fails
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
  })

  it('calls useGetMonthPeriodQuery with selected month from URL', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(useGetMonthPeriodQuery).toHaveBeenCalled()
    const args = vi.mocked(useGetMonthPeriodQuery).mock.calls[0][0]
    expect(args).toBe('2026-02')
  })

  it('calls useGetMonthPeriodQuery for foreman with month from URL', () => {
    renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-03',
    })
    const args = vi.mocked(useGetMonthPeriodQuery).mock.calls[0][0]
    expect(args).toBe('2026-03')
  })

  it('uses default month when month param missing', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports',
    })
    const args = vi.mocked(useGetMonthPeriodQuery).mock.calls[0][0]
    expect(args).toMatch(/^\d{4}-\d{2}$/)
  })

  it('still calls month-period query when tab=income is present', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=income&month=2026-02',
    })
    const args = vi.mocked(useGetMonthPeriodQuery).mock.calls[0][0]
    expect(args).toBe('2026-02')
  })
})
