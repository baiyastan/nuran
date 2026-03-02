import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../LoginForm'
import { useLoginMutation } from '@/shared/api/authApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { renderWithProviders } from '@/testing/renderWithProviders'

const mockLogin = vi.fn()

vi.mock('@/shared/api/authApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/authApi')>()
  return {
    ...actual,
    useLoginMutation: vi.fn(),
  }
})

vi.mock('@/shared/hooks/useAuth', () => ({ useAuth: vi.fn() }))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      role: undefined,
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useLoginMutation>)
    mockLogin.mockReset()
  })

  it('shows API error via getErrorMessage (detail)', async () => {
    mockLogin.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: 'Invalid credentials' } }),
    })

    const { container } = renderWithProviders(<LoginForm />)
    const passwordInput = container.querySelector<HTMLInputElement>('input[name="password"]')
    expect(passwordInput).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('example@gmail.com'), 'u@b.com')
    await userEvent.type(passwordInput!, 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'auth.signIn' }))

    expect(mockLogin).toHaveBeenCalledWith({ email: 'u@b.com', password: 'password123' })
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
  })

  it('shows getErrorMessage result when API rejects with empty object', async () => {
    mockLogin.mockReturnValue({
      unwrap: () => Promise.reject({}),
    })

    const { container } = renderWithProviders(<LoginForm />)
    const passwordInput = container.querySelector<HTMLInputElement>('input[name="password"]')
    expect(passwordInput).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('example@gmail.com'), 'u@b.com')
    await userEvent.type(passwordInput!, 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'auth.signIn' }))

    expect(screen.getByText('{}')).toBeInTheDocument()
  })

  it('submit button is disabled when loading', () => {
    vi.mocked(useLoginMutation).mockReturnValue([
      mockLogin,
      { isLoading: true, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useLoginMutation>)

    renderWithProviders(<LoginForm />)

    expect(screen.getByRole('button', { name: 'auth.signingIn' })).toBeDisabled()
  })
})
