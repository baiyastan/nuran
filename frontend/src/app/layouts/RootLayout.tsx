import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '@/widgets/header/Header'
import Sidebar from '@/shared/ui/Sidebar/Sidebar'
import '@/widgets/layout/Layout.css'

const SIDEBAR_STORAGE_KEY = 'sidebar_collapsed'

function RootLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })
  const layoutBodyClass = `layout-body${isSidebarCollapsed ? ' layout-body--sidebar-collapsed' : ''}`

  return (
    <div className="layout">
      <Header />
      <div className={layoutBodyClass}>
        <Sidebar onCollapsedChange={setIsSidebarCollapsed} />
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default RootLayout

