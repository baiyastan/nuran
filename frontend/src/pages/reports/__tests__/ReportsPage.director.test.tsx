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

describe('ReportsPage – director', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useReportsData).mockClear()
  })

  it('director sees OFFICE, PROJECT, CHARITY and income tabs (same as admin)', () => {
    renderReportsPage({
      role: 'director',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(screen.getByRole('button', { name: 'tabs.office' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.project' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.charity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'tabs.income' })).toBeInTheDocument()
  })

  it('director invalid tab/scope sanitizes to default (office)', async () => {
    const { getLocationSearch } = renderReportsPage({
      role: 'director',
      initialUrl: '/reports?tab=invalid&scope=invalid&month=2026-02',
    })
    await waitFor(() => {
      const search = getLocationSearch()
      expect(search).toContain('tab=office')
      expect(search).toContain('scope=office')
    })
  })
})
