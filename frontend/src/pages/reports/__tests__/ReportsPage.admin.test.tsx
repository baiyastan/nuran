import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useReportsData } from '../hooks/useReportsData'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useReportsData', () => ({ useReportsData: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – admin', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useReportsData).mockClear()
  })

  it('admin sees OFFICE, PROJECT, CHARITY and income tabs', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByRole('button', { name: 'tabs.office' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.charity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.income' })).toBeInTheDocument()
  })

  it('URL sanitization keeps selected tab/scope valid for admin', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=invalid&scope=invalid&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=')
      expect(search).toContain('scope=')
      const tabMatch = search.match(/tab=([^&]+)/)
      const scopeMatch = search.match(/scope=([^&]+)/)
      if (tabMatch) expect(['office', 'project', 'charity', 'income']).toContain(tabMatch[1])
      if (scopeMatch && tabMatch?.[1] !== 'income')
        expect(['office', 'project', 'charity']).toContain(scopeMatch[1])
    })
  })

  it('valid tab and scope are preserved (admin with tab=charity)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=charity&scope=charity&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=charity')
      expect(search).toContain('scope=charity')
    })
    expect(screen.getByRole('button', { name: 'tabs.charity' }).classList.contains('active')).toBe(true)
  })

  it('office tab button has active class when tab=office', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByRole('button', { name: 'tabs.office' }).classList.contains('active')).toBe(true)
  })

  it('expense section renders with minimal data (smoke)', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByText('title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.office' })).toBeInTheDocument()
  })
})
