import { describe, it, expect, vi, beforeEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useReportsData } from '../hooks/useReportsData'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useReportsData', () => ({ useReportsData: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – URL edge cases', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useReportsData).mockClear()
  })

  it('foreman with invalid tab (charity) sanitizes to tab=project and scope=project', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=project')
      expect(search).toContain('scope=project')
    })
  })

  it('missing month param uses default month for data (page renders)', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports',
    })
    expect(useReportsData).toHaveBeenCalled()
    const call = vi.mocked(useReportsData).mock.calls[0][0]
    expect(call.selectedMonth).toMatch(/^\d{4}-\d{2}$/)
  })

  it('director with invalid tab sanitizes to valid tab (office default)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'director',
      initialUrl: '/reports?tab=invalid&scope=invalid&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=')
      expect(search).toContain('scope=')
      const tabMatch = search.match(/tab=([^&]+)/)
      if (tabMatch) {
        expect(['office', 'project', 'charity', 'income']).toContain(tabMatch[1])
      }
    })
  })
})
