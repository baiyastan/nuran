import { describe, it, expect, vi } from 'vitest'
import { Routes, Route } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '@/testing/renderWithProviders'
import RequireAuth from '../RequireAuth'
import { axiosInstance } from '@/shared/api/axiosInstance'

vi.mock('@/shared/api/axiosInstance', () => ({
  axiosInstance: vi.fn(),
}))

function ProtectedContent() {
  return <div>Protected content</div>
}

describe('Auth bootstrap flow', () => {
  it('stale token + refresh fails -> redirects to /login (no infinite loader)', async () => {
    const firstMeError = {
      isAxiosError: true,
      response: { status: 401, data: { detail: 'Invalid token' } },
      message: 'Unauthorized',
      config: {},
      name: 'AxiosError',
    }

    const refreshError = {
      isAxiosError: true,
      response: { status: 401, data: { detail: 'Refresh failed' } },
      message: 'Unauthorized',
      config: {},
      name: 'AxiosError',
    }

    vi.mocked(axiosInstance)
      // initial /auth/me/
      .mockRejectedValueOnce(firstMeError)
      // /auth/refresh/
      .mockRejectedValueOnce(refreshError)

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
            accessToken: 'stale-token',
            user: null,
            meStatus: 'idle',
          },
        } as any,
      }
    )

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument()
    })
  })

  it('retries /auth/me/ only once after successful refresh and does not loop on repeated 401', async () => {
    const firstMeError = {
      isAxiosError: true,
      response: { status: 401, data: { detail: 'Invalid token' } },
      message: 'Unauthorized',
      config: { url: '/auth/me/' },
      name: 'AxiosError',
    }

    const refreshSuccess = {
      data: { access: 'new-token' },
    }

    const secondMeError = {
      isAxiosError: true,
      response: { status: 401, data: { detail: 'Still invalid after refresh' } },
      message: 'Unauthorized',
      config: { url: '/auth/me/' },
      name: 'AxiosError',
    }

    vi.mocked(axiosInstance)
      // initial /auth/me/
      .mockRejectedValueOnce(firstMeError)
      // /auth/refresh/
      .mockResolvedValueOnce(refreshSuccess as any)
      // retried /auth/me/ with new token -> still 401
      .mockRejectedValueOnce(secondMeError)

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
            accessToken: 'stale-token',
            user: null,
            meStatus: 'idle',
          },
        } as any,
      }
    )

    await waitFor(() => {
      expect(screen.getByText('Login page')).toBeInTheDocument()
    })

    // 1st call: /auth/me/, 2nd: /auth/refresh/, 3rd: retried /auth/me/
    expect(axiosInstance).toHaveBeenCalledTimes(3)
  })
})


