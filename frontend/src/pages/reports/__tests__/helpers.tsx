import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { Routes, Route } from 'react-router-dom'
import ReportsPage from '../ReportsPage'
import { TestRouter } from '@/testing/TestRouter'
import { useAuth } from '@/shared/hooks/useAuth'
import { useReportsData } from '../hooks/useReportsData'

export function minimalReportsData(overrides?: {
  monthPeriodStatus?: 'OPEN' | 'LOCKED' | null
}): ReturnType<typeof useReportsData> {
  return {
    financePeriodId: null,
    budgetPlanId: null,
    monthPeriodStatus: overrides?.monthPeriodStatus ?? 'OPEN',
    incomePlanned: {
      period: null,
      summary: { total_amount: '0.00', items_count: 0 },
      items: [],
      total: 0,
    },
    incomeActual: [],
    incomeActualTotal: 0,
    incomeDelta: 0,
    incomeDeltaPercent: 0,
    incomeBySource: [],
    expensePlanned: {
      budgetPlan: null,
      lines: [],
      total: 0,
    },
    expenseActual: [],
    expenseActualTotal: 0,
    expenseDelta: 0,
    expenseDeltaPercent: null,
    expenseByCategory: [],
    incomeDailyTotals: [],
    expenseDailyTotals: [],
    expenseFacts: { items: [], loading: false, error: null },
    loading: {
      financePeriod: false,
      monthPeriod: false,
      incomePlanned: false,
      incomeActual: false,
      expensePlanned: false,
      expenseActual: false,
    },
    errors: {
      financePeriod: null,
      monthPeriod: null,
      incomePlanned: null,
      incomeActual: null,
      expensePlanned: null,
      expenseActual: null,
    },
    warnings: {
      incomePlannedOfficeOnly: false,
      noBudgetPlan: false,
      noFinancePeriod: false,
    },
  } as ReturnType<typeof useReportsData>
}

export interface RenderReportsPageOptions {
  role: 'admin' | 'director' | 'foreman'
  initialUrl?: string
  reportsDataOverride?: Parameters<typeof minimalReportsData>[0]
}

export function renderReportsPage({
  role,
  initialUrl = '/reports?tab=office&scope=office&month=2026-02',
  reportsDataOverride,
}: RenderReportsPageOptions) {
  vi.mocked(useAuth).mockReturnValue({ role } as unknown as ReturnType<typeof useAuth>)
  vi.mocked(useReportsData).mockReturnValue(
    minimalReportsData(reportsDataOverride) as unknown as ReturnType<typeof useReportsData>
  )

  const result = render(
    <TestRouter initialEntries={[initialUrl.startsWith('/') ? initialUrl : `/${initialUrl}`]}>
      <Routes>
        <Route path="/reports" element={<ReportsPage />} />
      </Routes>
    </TestRouter>
  )

  return {
    ...result,
    getLocationSearch: () => {
      const el = result.container.querySelector('[data-testid="location-display"]')
      return el?.textContent ?? ''
    },
  }
}
