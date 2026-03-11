import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – admin', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
  })

  it('renders reports page header and global summary for admin', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    // Title from ReportsPage
    expect(screen.getByText('title')).toBeInTheDocument()
    // Global summary section from GlobalSummary
    expect(screen.getByText('globalSummary.title')).toBeInTheDocument()
  })

  it('keeps existing tab/scope query params for admin (only month is managed)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=invalid&scope=invalid&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=invalid')
      expect(search).toContain('scope=invalid')
      expect(search).toContain('month=2026-02')
    })
  })

  it('preserves valid tab and scope values in URL for admin', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=charity')
      expect(search).toContain('scope=charity')
      expect(search).toContain('month=2026-02')
    })
  })

  it('does not modify tab/scope when tab=office for admin', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    const search = screen.getByTestId('location-display').textContent || ''
    expect(search).toContain('tab=office')
    expect(search).toContain('scope=office')
  })

  it('renders without error for admin (smoke)', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByText('title')).toBeInTheDocument()
  })
})
