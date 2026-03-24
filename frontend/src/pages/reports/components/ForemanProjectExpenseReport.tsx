import { useTranslation } from 'react-i18next'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { ExpenseSection } from './ExpenseSection'
import { useReportsData, getQueryErrorStatus } from '../hooks/useReportsData'

function monthValidationFromError(error: unknown): string | null {
  const status = getQueryErrorStatus(error)
  if (status !== 400) return null
  const data =
    error && typeof error === 'object' && 'data' in error
      ? (error as { data: unknown }).data
      : null
  if (data && typeof data === 'object' && data !== null && 'month' in data) {
    return String((data as { month: unknown }).month)
  }
  return null
}

interface ForemanProjectExpenseReportProps {
  month: string
  monthStatus: 'OPEN' | 'LOCKED' | null
}

/**
 * Foreman: same expense report math as admin PROJECT tab (/reports/monthly + actual-expenses),
 * without owner-only dashboard KPI endpoints.
 */
export function ForemanProjectExpenseReport({
  month,
  monthStatus,
}: ForemanProjectExpenseReportProps) {
  const { t } = useTranslation('reports')
  const data = useReportsData({
    selectedMonth: month,
    selectedTab: 'project',
    selectedProjectId: null,
  })

  const loadingMain = data.loading.monthPeriod || data.loading.expensePlanned

  if (loadingMain) {
    return <LoadingScreen compact title={t('loading')} description="" />
  }

  if (data.monthlyReportError) {
    if (data.monthlyReportErrorStatus === 403) {
      return (
        <div className="summary-error" role="alert">
          {t('errors.noReportsAccess')}
        </div>
      )
    }
    const monthValidation = monthValidationFromError(data.monthlyReportError)
    if (monthValidation) {
      return (
        <div className="summary-error" role="alert">
          {monthValidation}
        </div>
      )
    }
    return (
      <div className="summary-error" role="alert">
        {t('errors.loadReport')}
      </div>
    )
  }

  const factsAccessDenied = data.expenseFactsErrorStatus === 403

  return (
    <div className="foreman-project-report">
      {data.warnings.noBudgetPlan && (
        <div className="summary-no-data" role="status">
          {t('warnings.noBudgetPlan')}
        </div>
      )}
      {factsAccessDenied && (
        <div className="summary-error" role="alert">
          {t('errors.noReportsAccess')}
        </div>
      )}
      <ExpenseSection
        planned={data.expensePlanned}
        actual={data.expenseActual}
        actualTotal={data.expenseActualTotal}
        delta={data.expenseDelta}
        deltaPercent={data.expenseDeltaPercent}
        monthStatus={monthStatus}
        loading={{
          planned: data.loading.expensePlanned,
          actual: data.loading.expenseActual,
        }}
        expenseByCategory={data.expenseByCategory}
        expenseDailyTotals={data.expenseDailyTotals}
        expenseFacts={{
          ...data.expenseFacts,
          error: factsAccessDenied ? null : data.expenseFacts.error,
        }}
        showPlanned
        showActual={!factsAccessDenied}
        showCategoryPlannedVsActualChart={false}
        showDailyExpenseChart={false}
        foremanExpenseUi
      />
    </div>
  )
}
