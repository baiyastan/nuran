import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Header from '@/widgets/header/Header'
import Sidebar from '@/widgets/sidebar/Sidebar'
import '@/widgets/layout/Layout.css'

function RootLayout() {
  return (
    <div className="layout">
      <Header />
      <div className="layout-body">
        <Sidebar />
        <main className="layout-main">
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default RootLayout

