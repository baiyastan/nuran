import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useGetDashboardKpiQuery } from '@/shared/api/reportsApi'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/api/reportsApi', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/reportsApi')>(
    '@/shared/api/reportsApi'
  )
  return {
    ...actual,
    useGetDashboardKpiQuery: vi.fn(),
  }
})

describe('ReportsPage – dashboard KPIs', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useGetDashboardKpiQuery).mockClear()
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as unknown as ReturnType<typeof useAuth>)
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
      // We expect formatted KGS, but at minimum the raw numbers should appear somewhere
      expect(screen.getByText(/1000/)).toBeInTheDocument()
      expect(screen.getByText(/400/)).toBeInTheDocument()
      expect(screen.getByText(/600/)).toBeInTheDocument()
    })

    expect(useGetDashboardKpiQuery).toHaveBeenCalledWith({ month: '2026-02' })
  })
})

