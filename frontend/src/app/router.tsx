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
const UsersPage = lazy(() => import('@/pages/admin/UsersPage'))
const CategoriesPage = lazy(() => import('@/pages/admin/CategoriesPage'))
const IncomeSourcesPage = lazy(() => import('@/pages/admin/IncomeSourcesPage'))
const BudgetReportPage = lazy(() => import('@/pages/admin/BudgetReportPage'))
const SubmittedProjectPlansPage = lazy(() => import('@/pages/admin/SubmittedProjectPlansPage'))
const MonthManagementPage = lazy(() => import('@/pages/admin/MonthManagementPage'))
const PlanSetupPage = lazy(() => import('@/pages/planSetup/PlanSetupPage'))
const FinancePage = lazy(() => import('@/pages/finance/FinancePage'))
const ExpensesPage = lazy(() => import('@/pages/expenses/ExpensesPage'))
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage'))

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
            path: 'expenses',
            element: <RequireRole allowedRoles={['admin', 'director']} />,
            children: [
              {
                index: true,
                element: <ExpensesPage />,
              },
            ],
          },
          {
            path: 'finance',
            element: <RequireRole allowedRoles={['admin', 'director']} />,
            children: [
              {
                index: true,
                element: <FinancePage />,
              },
            ],
          },
          {
            path: 'finance-periods/:id',
            element: <Navigate to="/finance" replace />,
          },
          {
            path: 'finance-periods',
            element: <Navigate to="/finance" replace />,
          },
          {
            path: 'reports',
            element: <RequireRole allowedRoles={['admin', 'director', 'foreman']} />,
            children: [
              {
                index: true,
                element: <ReportsPage />,
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
                path: 'income-sources',
                element: <IncomeSourcesPage />,
              },
              {
                path: 'submitted-plans',
                element: <SubmittedProjectPlansPage />,
              },
              {
                path: 'budget-report',
                element: <BudgetReportPage />,
              },
              {
                path: 'months',
                element: <MonthManagementPage />,
              },
            ],
          },
          {
            path: 'plan-setup',
            element: <RequireRole allowedRoles={['admin', 'director', 'foreman']} />,
            children: [
              {
                index: true,
                element: <PlanSetupPage />,
              },
            ],
          },
          {
            path: 'prorab',
            element: <RequireRole allowedRoles={['admin', 'director']} />,
            children: [
              {
                index: true,
                element: <Navigate to="/plan-setup" replace />,
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

