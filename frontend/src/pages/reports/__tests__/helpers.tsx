import { vi } from 'vitest'
import { Routes, Route } from 'react-router-dom'
import ReportsPage from '../ReportsPage'
import { TestRouter } from '@/testing/TestRouter'
import { useAuth } from '@/shared/hooks/useAuth'
import { renderWithProviders } from '@/testing/renderWithProviders'

export interface RenderReportsPageOptions {
  role: 'admin' | 'director' | 'foreman'
  initialUrl?: string
}

export function renderReportsPage({
  role,
  initialUrl = '/reports?tab=office&scope=office&month=2026-02',
}: RenderReportsPageOptions) {
  vi.mocked(useAuth).mockReturnValue({ role } as unknown as ReturnType<typeof useAuth>)

  const { container, ...rtlResult } = renderWithProviders(
    <TestRouter initialEntries={[initialUrl.startsWith('/') ? initialUrl : `/${initialUrl}`]}>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </TestRouter>,
    {
      // TestRouter already provides a MemoryRouter; avoid nesting routers.
      withRouter: false,
    }
  )

  return {
    container,
    ...rtlResult,
    getLocationSearch: () => {
      const el = container.querySelector('[data-testid="location-display"]')
      return el?.textContent ?? ''
    },
  }
}
