import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { PlanPeriodsPage } from '@/pages/plan-periods/PlanPeriodsPage'
import { PlanPeriodDetailsPage } from '@/pages/plan-periods/PlanPeriodDetailsPage'
import CategoriesPage from '@/pages/admin/CategoriesPage'
import Layout from '@/widgets/layout/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function RoleRoute({ 
  children, 
  allowedRoles 
}: { 
  children: React.ReactNode
  allowedRoles: string[]
}) {
  const { role } = useAuth()
  
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/plan-periods" replace />
  }
  
  return <>{children}</>
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/plan-periods" replace />} />
        <Route
          path="projects"
          element={
            <RoleRoute allowedRoles={['admin', 'director']}>
              <ProjectsPage />
            </RoleRoute>
          }
        />
        <Route path="plan-periods" element={<PlanPeriodsPage />} />
        <Route path="plan-periods/:id" element={<PlanPeriodDetailsPage />} />
        <Route
          path="admin/categories"
          element={
            <RoleRoute allowedRoles={['admin']}>
              <CategoriesPage />
            </RoleRoute>
          }
        />
      </Route>
    </Routes>
  )
}
