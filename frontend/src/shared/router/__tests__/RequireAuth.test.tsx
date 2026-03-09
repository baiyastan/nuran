import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import RequireAuth from '../RequireAuth'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAuthBootstrap } from '@/shared/hooks/useAuthBootstrap'

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/shared/hooks/useAuthBootstrap', () => ({ useAuthBootstrap: vi.fn() }))

function ProtectedContent() {
  return <div>Protected content</div>
}

describe('RequireAuth', () => {
  beforeEach(() => {
    vi.mocked(useAuthBootstrap).mockReturnValue({ bootstrapping: false })
  })

  it('redirects to /login when not authenticated', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      isLoadingMe: false,
      role: undefined,
    } as unknown as ReturnType<typeof useAuth>)

    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth />}>
          <Route index element={<ProtectedContent />} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      { initialEntries: ['/'] }
    )

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('shows loading when bootstrapping', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoadingMe: false,
      role: 'admin',
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useAuthBootstrap).mockReturnValue({ bootstrapping: true })

    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth />}>
          <Route index element={<ProtectedContent />} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      { initialEntries: ['/'] }
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('shows loading when authenticated but isLoadingMe', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoadingMe: true,
      role: undefined,
    } as unknown as ReturnType<typeof useAuth>)

    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth />}>
          <Route index element={<ProtectedContent />} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      { initialEntries: ['/'] }
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('renders outlet when authenticated with role', () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      isLoadingMe: false,
      role: 'admin',
    } as unknown as ReturnType<typeof useAuth>)

    renderWithProviders(
      <Routes>
        <Route path="/" element={<RequireAuth />}>
          <Route index element={<ProtectedContent />} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
      {
        initialEntries: ['/'],
        preloadedState: {
          auth: {
            meStatus: 'succeeded',
            accessToken: 'token',
            user: { id: 1, email: 'a@b.com', role: 'admin' },
          },
        },
      }
    )

    expect(screen.getByText('Protected content')).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })
})
