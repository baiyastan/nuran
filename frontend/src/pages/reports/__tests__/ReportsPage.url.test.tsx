import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – URL edge cases', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
  })

  it('foreman: tab/scope query params are stripped (PROJECT-only reports; backend enforces scope)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).not.toContain('tab=')
      expect(search).not.toContain('scope=')
      expect(search).toContain('month=2026-02')
    })
  })

  it('missing month param still renders page (default month handled internally)', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports',
    })
    // We don't assert on URL normalization here; hook tests cover default month logic.
    // Just ensure the page renders and header is present.
    expect(document.querySelector('h1')?.textContent).toBe('title')
  })

  it('director with invalid tab/scope leaves them unchanged (ReportsPage only manages month)', async () => {
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
