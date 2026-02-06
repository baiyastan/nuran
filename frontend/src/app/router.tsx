import { lazy } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import RequireAuth from '@/shared/router/RequireAuth'
import RequireRole from '@/shared/router/RequireRole'
import RootLayout from './layouts/RootLayout'
import RouteErrorPage from '@/pages/errors/RouteErrorPage'
import NotFoundPage from '@/pages/errors/NotFoundPage'
import ForbiddenPage from '@/pages/errors/ForbiddenPage'
import LandingRedirect from './LandingRedirect'

// Lazy load pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'))
const ProjectsPage = lazy(() => import('@/pages/projects/ProjectsPage'))
const PlanPeriodsPage = lazy(() => import('@/pages/plan-periods/PlanPeriodsPage'))
const PlanPeriodDetailsPage = lazy(() => import('@/pages/plan-periods/PlanPeriodDetailsPage'))
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'))
const ProrabProjectsPage = lazy(() => import('@/pages/prorab/ProrabProjectsPage'))
const ProrabPlanPeriodsPage = lazy(() => import('@/pages/prorab/ProrabPlanPeriodsPage'))
const ProrabPlanRedirect = lazy(() => import('@/pages/prorab/ProrabPlanRedirect'))
const ProrabBudgetPlanPage = lazy(() => import('@/pages/prorab/ProrabBudgetPlanPage'))
const ProrabBudgetReportPage = lazy(() => import('@/pages/prorab/ProrabBudgetReportPage'))
const SubmittedProjectPlansPage = lazy(() => import('@/pages/admin/SubmittedProjectPlansPage'))
const BudgetReportPage = lazy(() => import('@/pages/admin/BudgetReportPage'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/',
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <RootLayout />,
        children: [
          {
            index: true,
            element: <LandingRedirect />,
          },
          {
            path: 'plan-periods',
            element: <RequireRole allowedRoles={['admin', 'director']} />,
            children: [
              {
                index: true,
                element: <PlanPeriodsPage />,
              },
              {
                path: ':id',
                element: <PlanPeriodDetailsPage />,
              },
            ],
          },
          {
            path: 'projects',
            element: <RequireRole allowedRoles={['admin', 'director']} />,
            children: [
              {
                index: true,
                element: <ProjectsPage />,
              },
            ],
          },
          {
            path: 'admin',
            element: <RequireRole allowedRoles={['admin']} />,
            children: [
              {
                index: true,
                element: <Navigate to="/admin/users" replace />,
              },
              {
                path: 'users',
                element: <UsersPage />,
              },
              {
                path: 'categories',
                element: <CategoriesPage />,
              },
              {
                path: 'submitted-plans',
                element: <SubmittedProjectPlansPage />,
              },
              {
                path: 'budget-report',
                element: <BudgetReportPage />,
              },
            ],
          },
          {
            path: 'prorab',
            element: <RequireRole allowedRoles={['foreman']} />,
            children: [
              {
                index: true,
                element: <Navigate to="/prorab/projects" replace />,
              },
              {
                path: 'projects',
                element: <ProrabProjectsPage />,
              },
              {
                path: 'projects/:id/plan-periods',
                element: <ProrabPlanPeriodsPage />,
              },
              {
                path: 'projects/:projectId/budget/:periodId',
                element: <ProrabBudgetPlanPage />,
              },
              {
                path: 'projects/:projectId/budget/:periodId/report',
                element: <ProrabBudgetReportPage />,
              },
              {
                path: 'plan-periods/:periodId/plan',
                element: <ProrabPlanRedirect />,
              },
            ],
          },
          {
            path: '403',
            element: <ForbiddenPage />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])

