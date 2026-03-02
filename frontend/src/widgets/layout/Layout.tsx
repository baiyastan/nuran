import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '../header/Header'
import Sidebar from '@/shared/ui/Sidebar/Sidebar'
import './Layout.css'

function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  return (
    <div className="layout">
      <Header />
      <div className={`layout-body${sidebarCollapsed ? ' layout-body--sidebar-collapsed' : ''}`}>
        <Sidebar onCollapsedChange={setSidebarCollapsed} />
        <main className="layout-main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout

