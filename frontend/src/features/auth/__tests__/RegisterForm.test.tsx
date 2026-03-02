import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '../RegisterForm'
import { useRegisterMutation } from '@/shared/api/authApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { renderWithProviders } from '@/testing/renderWithProviders'

const mockRegister = vi.fn()

vi.mock('@/shared/api/authApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api/authApi')>()
  return {
    ...actual,
    useRegisterMutation: vi.fn(),
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

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: false,
      role: undefined,
    } as unknown as ReturnType<typeof useAuth>)
    vi.mocked(useRegisterMutation).mockReturnValue([
      mockRegister,
      { isLoading: false, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useRegisterMutation>)
    mockRegister.mockReset()
  })

  it('shows validation error when password and confirm do not match', async () => {
    const { container } = renderWithProviders(<RegisterForm />)
    const passwordInput = container.querySelector<HTMLInputElement>('input[name="password"]')
    const confirmInput = container.querySelector<HTMLInputElement>('input[name="confirmPassword"]')
    expect(passwordInput).toBeTruthy()
    expect(confirmInput).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('example@gmail.com'), 'u@b.com')
    await userEvent.type(passwordInput!, 'password123')
    await userEvent.type(confirmInput!, 'different')
    await userEvent.click(screen.getByRole('button', { name: 'auth.register' }))

    expect(mockRegister).not.toHaveBeenCalled()
    expect(screen.getByText('auth.passwordsDoNotMatch')).toBeInTheDocument()
  })

  it('shows API error via getErrorMessage (detail)', async () => {
    mockRegister.mockReturnValue({
      unwrap: () => Promise.reject({ data: { detail: 'Email already taken' } }),
    })

    const { container } = renderWithProviders(<RegisterForm />)
    const passwordInput = container.querySelector<HTMLInputElement>('input[name="password"]')
    const confirmInput = container.querySelector<HTMLInputElement>('input[name="confirmPassword"]')
    expect(passwordInput).toBeTruthy()
    expect(confirmInput).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('example@gmail.com'), 'u@b.com')
    await userEvent.type(passwordInput!, 'password123')
    await userEvent.type(confirmInput!, 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'auth.register' }))

    expect(mockRegister).toHaveBeenCalledWith({
      email: 'u@b.com',
      password: 'password123',
      password_confirm: 'password123',
    })
    expect(screen.getByText('Email already taken')).toBeInTheDocument()
  })

  it('submit button is disabled when loading', () => {
    vi.mocked(useRegisterMutation).mockReturnValue([
      mockRegister,
      { isLoading: true, reset: vi.fn() },
    ] as unknown as ReturnType<typeof useRegisterMutation>)

    renderWithProviders(<RegisterForm />)

    expect(screen.getByRole('button', { name: 'auth.registering' })).toBeDisabled()
  })
})
