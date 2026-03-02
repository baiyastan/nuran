import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import RequireRole from '../RequireRole'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))

function ChildContent() {
  return <div>Protected content</div>
}

describe('RequireRole', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token',
      user: { id: 1, email: 'a@b.com', role: 'admin' },
    } as unknown as ReturnType<typeof useAuth>)
  })

  it('admin role: renders children when allowed', () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireRole allowedRoles={['admin', 'director']} />}>
          <Route index element={<ChildContent />} />
        </Route>
      </Routes>,
      {
        preloadedState: {
          auth: {
            meStatus: 'succeeded',
            accessToken: null,
            user: null,
          },
        },
        initialEntries: ['/'],
      }
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('director role: renders children when allowed', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token',
      user: { id: 2, email: 'd@b.com', role: 'director' },
    } as unknown as ReturnType<typeof useAuth>)

    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireRole allowedRoles={['admin', 'director']} />}>
          <Route index element={<ChildContent />} />
        </Route>
      </Routes>,
      {
        preloadedState: {
          auth: {
            meStatus: 'succeeded',
            accessToken: null,
            user: null,
          },
        },
        initialEntries: ['/'],
      }
    )
    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('foreman role: redirects to /403 when not in allowedRoles', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      accessToken: 'token',
      user: { id: 3, email: 'f@b.com', role: 'foreman' },
    } as unknown as ReturnType<typeof useAuth>)

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
            meStatus: 'succeeded',
            accessToken: null,
            user: null,
          },
        },
        initialEntries: ['/'],
      }
    )
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
  })
})
