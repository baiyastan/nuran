import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderReportsPage } from './helpers'
import { useAuth } from '@/shared/hooks/useAuth'
import { useReportsData } from '../hooks/useReportsData'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('../hooks/useReportsData', () => ({ useReportsData: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))
vi.mock('@/features/month-gate/MonthGateBanner', () => ({ MonthGateBanner: () => null }))

describe('ReportsPage – useReportsData hook', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockClear()
    vi.mocked(useReportsData).mockClear()
  })

  it('calls useReportsData with selectedMonth, selectedTab, selectedProjectId', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=office&scope=office&month=2026-02',
    })
    expect(useReportsData).toHaveBeenCalled()
    const lastCall = vi.mocked(useReportsData).mock.calls[vi.mocked(useReportsData).mock.calls.length - 1]
    const args = lastCall[0]
    expect(args).toMatchObject({
      selectedMonth: '2026-02',
      selectedTab: 'office',
      selectedProjectId: null,
    })
  })

  it('calls useReportsData with selectedTab=project for foreman', () => {
    renderReportsPage({
      role: 'foreman',
      initialUrl: '/reports?tab=office&scope=office&month=2026-03',
    })
    const lastCall = vi.mocked(useReportsData).mock.calls[vi.mocked(useReportsData).mock.calls.length - 1]
    const args = lastCall[0]
    expect(args.selectedTab).toBe('project')
    expect(args.selectedMonth).toBe('2026-03')
    expect(args.selectedProjectId).toBeNull()
  })

  it('calls useReportsData with default month when month param missing', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports',
    })
    const lastCall = vi.mocked(useReportsData).mock.calls[vi.mocked(useReportsData).mock.calls.length - 1]
    const args = lastCall[0]
    expect(args.selectedMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(args.selectedTab).toBe('office')
    expect(args.selectedProjectId).toBeNull()
  })

  it('calls useReportsData with income tab when tab=income', () => {
    renderReportsPage({
      role: 'admin',
      initialUrl: '/reports?tab=income&month=2026-02',
    })
    const lastCall = vi.mocked(useReportsData).mock.calls[vi.mocked(useReportsData).mock.calls.length - 1]
    const args = lastCall[0]
    expect(args.selectedTab).toBe('income')
    expect(args.selectedMonth).toBe('2026-02')
    expect(args.selectedProjectId).toBeNull()
  })
})
