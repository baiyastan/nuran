import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from '@/widgets/header/Header'
import Sidebar from '@/shared/ui/Sidebar/Sidebar'
import '@/widgets/layout/Layout.css'

const SIDEBAR_STORAGE_KEY = 'sidebar_collapsed'

function RootLayout() {
  const location = useLocation()
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [isMobileViewport, setIsMobileViewport] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.innerWidth < 1024
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia('(max-width: 1023px)')

    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobileViewport(event.matches)
      if (!event.matches) {
        setIsMobileSidebarOpen(false)
      }
    }

    setIsMobileViewport(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleViewportChange)

    return () => mediaQuery.removeEventListener('change', handleViewportChange)
  }, [])

  useEffect(() => {
    if (!isMobileViewport || !isMobileSidebarOpen) {
      document.body.style.overflow = ''
      return
    }

    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileViewport, isMobileSidebarOpen])

  useEffect(() => {
    if (!isMobileViewport || !isMobileSidebarOpen) {
      return
    }

    const drawer = document.getElementById('mobile-app-sidebar')
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    const getFocusableElements = () =>
      drawer
        ? (Array.from(drawer.querySelectorAll(focusableSelector)).filter(
            (element) => element instanceof HTMLElement && element.offsetParent !== null
          ) as HTMLElement[])
        : []

    const focusableElements = getFocusableElements()
    if (focusableElements.length > 0 && drawer && !drawer.contains(document.activeElement)) {
      focusableElements[0].focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileSidebarOpen(false)
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const currentFocusable = getFocusableElements()
      if (currentFocusable.length === 0) {
        return
      }

      const first = currentFocusable[0]
      const last = currentFocusable[currentFocusable.length - 1]

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last.focus()
        }
        return
      }

      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileViewport, isMobileSidebarOpen])

  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isMobileSidebarOpen) {
      menuButtonRef.current?.focus()
    }
  }, [isMobileSidebarOpen])

  const layoutBodyClass = [
    'layout-body',
    isSidebarCollapsed ? 'layout-body--sidebar-collapsed' : '',
    isMobileViewport ? 'layout-body--mobile' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="layout">
      <Header />
      <div className={layoutBodyClass}>
        <Sidebar
          onCollapsedChange={setIsSidebarCollapsed}
          isMobile={isMobileViewport}
          isMobileOpen={isMobileSidebarOpen}
          onMobileOpenChange={setIsMobileSidebarOpen}
        />
        {isMobileViewport && (
          <>
            <button
              ref={menuButtonRef}
              type="button"
              className="layout-mobile-menu-button"
              onClick={() => setIsMobileSidebarOpen((prev) => !prev)}
              aria-label={isMobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isMobileSidebarOpen}
              aria-controls="mobile-app-sidebar"
            >
              {isMobileSidebarOpen ? '✕' : '☰'}
            </button>
            <button
              type="button"
              className={`layout-mobile-backdrop${isMobileSidebarOpen ? ' layout-mobile-backdrop--visible' : ''}`}
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Close navigation menu"
              aria-hidden={!isMobileSidebarOpen}
              tabIndex={isMobileSidebarOpen ? 0 : -1}
            />
          </>
        )}
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default RootLayout

