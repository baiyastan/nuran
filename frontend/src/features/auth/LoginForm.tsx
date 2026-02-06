import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLoginMutation } from '@/shared/api/authApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAppDispatch } from '@/app/hooks'
import { setCredentials } from '@/features/auth/authSlice'
import { Input } from '@/shared/ui/Input/Input'
import { PasswordField } from '@/shared/ui/PasswordField/PasswordField'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './LoginForm.css'

export function LoginForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [login, { isLoading: isLoggingIn }] = useLoginMutation()
  const dispatch = useAppDispatch()
  const { isAuthenticated, role } = useAuth()
  const navigate = useNavigate()

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && role) {
      navigate('/plan-periods')
    }
  }, [isAuthenticated, role, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    try {
      const result = await login({ email, password }).unwrap()
      // Store credentials (access token and user)
      // Refresh token is in HttpOnly cookie, not in response
      // Save access token to localStorage for persistence across page refreshes
      localStorage.setItem('accessToken', result.access)
      dispatch(setCredentials({ access: result.access, user: result.user }))
      // Redirect after successful login
      navigate('/plan-periods')
    } catch (err: any) {
      setError(getErrorMessage(err) || 'Login failed')
    }
  }

  const isLoading = isLoggingIn

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>{t('header.title')}</h1>
        <h2>{t('auth.loginTitle')}</h2>
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
            autoComplete="current-password"
            required
          />
          {error && <div className="login-error">{error}</div>}
          <Button type="submit" disabled={isLoading} className="login-button">
            {isLoading ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/register" style={{ color: '#007bff', textDecoration: 'none' }}>
              {t('auth.noAccount')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
