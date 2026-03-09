import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import RequireRole from '../RequireRole'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}))

function ChildContent() {
  return <div>Protected content</div>
}

describe('RequireRole – redirects', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token',
      user: { id: 1, email: 'a@b.com', role: 'admin' },
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('redirects to /login when meStatus is failed', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireRole allowedRoles={['admin', 'director']} />}>
          <Route index element={<ChildContent />} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      {
        preloadedState: {
          auth: {
            meStatus: 'failed',
            accessToken: null,
            user: null,
          },
        },
        initialEntries: ['/'],
      }
    )

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('shows Loader when meStatus is loading', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireRole allowedRoles={['admin', 'director']} />}>
          <Route index element={<ChildContent />} />
        </Route>
        <Route path="/403" element={<div>Forbidden</div>} />
      </Routes>,
      {
        preloadedState: {
          auth: {
            meStatus: 'loading',
            accessToken: 'token',
            user: null,
          },
        },
        initialEntries: ['/'],
      }
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.queryByText('Forbidden')).not.toBeInTheDocument()
  })
})
