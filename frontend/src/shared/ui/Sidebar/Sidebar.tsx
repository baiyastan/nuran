import { useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/shared/hooks/useAuth'
import { useAppDispatch } from '@/app/hooks'
import { useLogoutMutation } from '@/shared/api/authApi'
import { logout } from '@/features/auth/authSlice'
import { baseApi } from '@/shared/api/baseApi'
import { getMenuItemsByRole } from '@/shared/const/sidebarMenu'
import './Sidebar.css'

const STORAGE_KEY = 'sidebar_collapsed'

interface SidebarProps {
  onCollapsedChange?: (collapsed: boolean) => void
}

export default function Sidebar({ onCollapsedChange }: SidebarProps) {
  const { t } = useTranslation()
  const { isAuthenticated, role } = useAuth()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [logoutMutation] = useLogoutMutation()
  
  // Load collapsed state from localStorage on mount
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored === 'true'
    } catch (error) {
      console.error('Failed to read sidebar collapsed state from localStorage:', error)
      return false // Default to expanded
    }
  })

  // Save collapsed state to localStorage and notify parent whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isCollapsed))
    } catch (error) {
      console.error('Failed to save sidebar collapsed state to localStorage:', error)
    }
    onCollapsedChange?.(isCollapsed)
  }, [isCollapsed, onCollapsedChange])

  const handleLogout = useCallback(async () => {
    try {
      // Call logout endpoint to clear refresh cookie
      await logoutMutation().unwrap()
    } catch (error) {
      // Even if logout fails, clear local state
      console.error('Logout error:', error)
    } finally {
      // Clear local state, RTK Query cache and localStorage
      dispatch(logout())
      dispatch(baseApi.util.resetApiState())
      // logout() reducer already clears localStorage, but ensure it's cleared here too
      try {
        localStorage.removeItem('accessToken')
        localStorage.removeItem(STORAGE_KEY)
      } catch (err) {
        console.error('Failed to clear localStorage:', err)
      }
      navigate('/login')
    }
  }, [logoutMutation, dispatch, navigate])

  // Edge case: If authenticated but role is missing → force logout and redirect
  useEffect(() => {
    if (isAuthenticated && !role) {
      handleLogout()
    }
  }, [isAuthenticated, role, handleLogout])

  const menuItems = getMenuItemsByRole(role)

  // Don't render empty sidebar
  if (!isAuthenticated || !role || menuItems.length === 0) {
    return null
  }

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev)
  }

  return (
    <aside className={`sidebar ${isCollapsed ? 'sidebar--collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar__header">
        {!isCollapsed && <div className="sidebar__logo">{t('header.title')}</div>}
        <button
          className="sidebar__toggle"
          onClick={toggleCollapse}
          aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          type="button"
        >
          <span className="sidebar__toggle-icon">{isCollapsed ? '→' : '←'}</span>
        </button>
      </div>
      
      <nav className="sidebar__nav" role="navigation">
        <ul className="sidebar__list">
          {menuItems.map((item) => (
            <li key={item.path} className="sidebar__list-item">
              <NavLink
                to={item.path}
                end={item.path === '/admin'}
                className={({ isActive }) =>
                  `sidebar__item ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar__item-icon">
                  {item.icon ?? ''}
                </span>
                {!isCollapsed && (
                  <span className="sidebar__item-text">{t(item.label)}</span>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar__footer">
        <button
          className="sidebar__logout"
          onClick={handleLogout}
          type="button"
        >
          <span className="sidebar__logout-icon">🚪</span>
          {!isCollapsed && (
            <span className="sidebar__logout-text">{t('common.logout')}</span>
          )}
        </button>
      </div>
    </aside>
  )
}

