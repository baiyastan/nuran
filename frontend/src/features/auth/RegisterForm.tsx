import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRegisterMutation } from '@/shared/api/authApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAppDispatch } from '@/app/hooks'
import { setCredentials } from '@/features/auth/authSlice'
import { Input } from '@/shared/ui/Input/Input'
import { PasswordField } from '@/shared/ui/PasswordField/PasswordField'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './LoginForm.css'

export function RegisterForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [register, { isLoading: isRegistering }] = useRegisterMutation()
  const dispatch = useAppDispatch()
  const { isAuthenticated, role } = useAuth()
  const navigate = useNavigate()

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate('/')
    }
  }, [isAuthenticated, role, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate password match
    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'))
      return
    }

    try {
      const result = await register({
        email,
        password,
        password_confirm: confirmPassword,
      }).unwrap()
      // Store credentials (access token and user)
      // Refresh token is in HttpOnly cookie, not in response
      dispatch(setCredentials({ access: result.access, user: result.user }))
      // Redirect after successful registration
      navigate('/')
    } catch (err: unknown) {
      const passwordConfirmError =
        typeof err === 'object' && err !== null && typeof (err as Record<string, unknown>).data === 'object' && (err as Record<string, unknown>).data !== null
          ? ((err as Record<string, unknown>).data as Record<string, unknown>).password_confirm
          : undefined
      const firstPasswordConfirmMessage =
        Array.isArray(passwordConfirmError) && typeof passwordConfirmError[0] === 'string'
          ? passwordConfirmError[0]
          : undefined
      if (firstPasswordConfirmMessage) {
        setError(firstPasswordConfirmMessage)
      } else {
        setError(getErrorMessage(err) || 'Registration failed')
      }
    }
  }

  const isLoading = isRegistering

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>{t('header.title')}</h1>
        <h2>{t('auth.registerTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@gmail.com"
            required
            autoFocus
          />
          <PasswordField
            label={t('auth.password')}
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <PasswordField
            label={t('auth.confirmPassword')}
            name="confirmPassword"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          {error && <div className="login-error">{error}</div>}
          <Button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? t('auth.registering') : t('auth.register')}
          </Button>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/login" style={{ color: '#007bff', textDecoration: 'none' }}>
              {t('auth.haveAccount')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

