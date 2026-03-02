import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import { TestRouter } from '@/testing/TestRouter'
import { useAuth } from '@/shared/hooks/useAuth'
import { PlanSetupScopeSurrogate } from './planSetupPageSurrogate'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))

describe('PlanSetupPage – admin', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ role: 'admin' } as unknown as ReturnType<typeof useAuth>)
  })

  it('scope select has 3 options: OFFICE, PROJECT, CHARITY', () => {
    render(
      <TestRouter initialEntries={['/plan-setup?month=2026-02&scope=OFFICE']}>
        <Routes>
          <Route path="/plan-setup" element={<PlanSetupScopeSurrogate />} />
        </Routes>
      </TestRouter>
    )
    const scopeSelect = screen.getByRole('combobox', { name: /fields\.scope/i })
    const options = Array.from(scopeSelect.querySelectorAll('option')).map(
      (o) => o.value
    )
    expect(options).toEqual(['OFFICE', 'PROJECT', 'CHARITY'])
  })
})
