import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '@/testing/TestRouter'
import { useAuth } from '@/shared/hooks/useAuth'
import { PlanSetupScopeSurrogate } from './planSetupPageSurrogate'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))

describe('PlanSetupPage – foreman', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'foreman' } as unknown as ReturnType<typeof useAuth>)
  })

  it('scope select contains only PROJECT for foreman', () => {
    render(
      <TestRouter initialEntries={['/plan-setup?month=2026-02&scope=CHARITY']}>
        <Routes>
          <Route path="/plan-setup" element={<PlanSetupScopeSurrogate />} />
        </Routes>
      </TestRouter>
    )
    const scopeSelect = screen.getByRole('combobox', { name: /fields\.scope/i })
    const options = Array.from(scopeSelect.querySelectorAll('option')).map(
      (o) => o.value
    )
    expect(options).toEqual(['PROJECT'])
  })

  it('sanitizes URL to scope=PROJECT for foreman', async () => {
    render(
      <TestRouter initialEntries={['/plan-setup?month=2026-02&scope=CHARITY']}>
        <Routes>
          <Route path="/plan-setup" element={<PlanSetupScopeSurrogate />} />
        </Routes>
      </TestRouter>
    )
    const locationEl = screen.getByTestId('location-display')
    await waitFor(() => {
      const search = locationEl.textContent ?? ''
      expect(search).toContain('scope=PROJECT')
    })
  })
})
