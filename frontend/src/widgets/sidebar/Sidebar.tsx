import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/shared/hooks/useAuth'
import './Sidebar.css'

export default function Sidebar() {
  const { t } = useTranslation()
  const { role } = useAuth()

  const sidebarTitle = role === 'foreman' 
    ? t('nav.menu') 
    : (role === 'admin' || role === 'director') 
      ? t('nav.management') 
      : ''

  return (
    <aside className="sidebar" aria-label="Main navigation">
      {sidebarTitle && (
        <div className="sidebar-title">{sidebarTitle}</div>
      )}
      <nav role="navigation">
        <ul>
          {role === 'foreman' ? (
            // Foreman navigation
            <>
              <li>
                <NavLink 
                  to="/prorab/projects" 
                  className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                >
                  {t('nav.myProjects')}
                </NavLink>
              </li>
            </>
          ) : (
            // Admin/Director navigation
            <>
              {(role === 'admin' || role === 'director') && (
                <li>
                  <NavLink 
                    to="/projects" 
                    className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                  >
                    {t('nav.projects')}
                  </NavLink>
                </li>
              )}
              {(role === 'admin' || role === 'director') && (
                <li>
                  <NavLink 
                    to="/plan-periods" 
                    className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                  >
                    {t('nav.planPeriods')}
                  </NavLink>
                </li>
              )}
              {role === 'admin' && (
                <>
                  <li>
                    <NavLink 
                      to="/admin/users" 
                      className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                    >
                      {t('nav.users')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/admin/categories" 
                      className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                    >
                      {t('categories.title')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/admin/submitted-plans" 
                      className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                    >
                      {t('submittedPlans.title')}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink 
                      to="/admin/budget-report" 
                      className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
                    >
                      {t('budgetReport.title')}
                    </NavLink>
                  </li>
                </>
              )}
            </>
          )}
        </ul>
      </nav>
    </aside>
  )
}
