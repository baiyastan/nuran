import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAppDispatch } from '@/app/hooks'
import { useLogoutMutation } from '@/shared/api/authApi'
import { logout } from '@/features/auth/authSlice'
import { Button } from '@/shared/ui/Button/Button'
import LanguageSwitcher from '@/shared/ui/LanguageSwitcher/LanguageSwitcher'
import './Header.css'

function Header() {
  const { t } = useTranslation()
  const location = useLocation()
  const { user } = useAuth()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logoutMutation] = useLogoutMutation()

  const getPageTitle = (): string => {
    const pathname = location.pathname
    
    if (pathname === '/projects') {
      return t('pages.projects.title')
    }
    if (pathname === '/plan-periods') {
      return t('pages.planPeriods.title')
    }
    if (pathname.startsWith('/plan-periods/')) {
      return t('pages.planPeriodDetails.title')
    }
    if (pathname === '/admin/users' || pathname.startsWith('/admin/users')) {
      return t('pages.users.title')
    }
    if (pathname.startsWith('/admin')) {
      return t('pages.admin.title')
    }
    
    return ''
  }

  const handleLogout = async () => {
    try {
      // Call logout endpoint to clear refresh cookie
      await logoutMutation().unwrap()
    } catch (error) {
      // Even if logout fails, clear local state
      console.error('Logout error:', error)
    } finally {
      // Clear local state and localStorage
      dispatch(logout())
      // logout() reducer already clears localStorage, but ensure it's cleared here too
      try {
        localStorage.removeItem('accessToken')
      } catch (err) {
        console.error('Failed to clear accessToken from localStorage:', err)
      }
      navigate('/login')
    }
  }

  const pageTitle = getPageTitle()

  return (
    <header className="header">
      <div className="header-content">
        {/* LEFT ZONE: Page Title/Breadcrumb */}
        <div className="header-left">
          {user && pageTitle && (
            <h1 className="header-page-title">{pageTitle}</h1>
          )}
        </div>

        {/* CENTER ZONE: Empty (reserved for future search) */}
        <div className="header-center"></div>

        {/* RIGHT ZONE: Language Switch, User Info, Logout */}
        <div className="header-right">
          {user && (
            <>
              <LanguageSwitcher />
              <span className="header-user">
                <span className="header-user-email">{user.email}</span>
                <span className="header-user-role">({t('header.userRole', { role: user.role })})</span>
              </span>
              <Button onClick={handleLogout} variant="secondary" size="small">
                {t('common.logout')}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
