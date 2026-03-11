import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – director', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
  })

  it('renders ReportsPage header and summary for director', () => {
    renderReportsPage({
      role: 'director',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByText('globalSummary.title')).toBeInTheDocument()
  })

  it('does not coerce tab/scope for director (only month is managed)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'director',
      initialUrl: '/reports?tab=invalid&scope=invalid&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=invalid')
      expect(search).toContain('scope=invalid')
      expect(search).toContain('month=2026-02')
    })
  })
})
