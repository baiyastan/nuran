import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – foreman', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
  })

  it('renders ReportsPage header and summary for foreman', () => {
    renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('globalSummary.title')).toBeInTheDocument()
  })

  it('does not change tab/scope for foreman (URL left as-is)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=office')
      expect(search).toContain('scope=office')
      expect(search).toContain('month=2026-02')
    })
  })

  it('leaves invalid tab/scope unchanged for foreman', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=charity')
      expect(search).toContain('scope=charity')
      expect(search).toContain('month=2026-02')
    })
  })
})
