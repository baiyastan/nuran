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

describe('ReportsPage – foreman', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useReportsData).mockClear()
  })

  it('shows only the project tab for foreman', () => {
    renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByRole('button', { name: 'tabs.project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'tabs.office' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'tabs.charity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'tabs.income' })).not.toBeInTheDocument()
  })

  it('sanitizes URL to tab=project and scope=project for foreman', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=project')
      expect(search).toContain('scope=project')
    })
  })

  it('foreman with invalid tab (charity) sanitizes to project', async () => {
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
})
