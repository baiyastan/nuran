import { useMemo, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { ReportsTabs } from './components/ReportsTabs'
import { MonthSelector } from './components/MonthSelector'
import { IncomeSection } from './components/IncomeSection'
import { ExpenseSection } from './components/ExpenseSection'
import { useReportsData } from './hooks/useReportsData'
import { ReportTab } from './types/reports.types'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import { useAuth } from '@/shared/hooks/useAuth'
import './ReportsPage.css'

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)

const ALL_TABS: ReportTab[] = ['office', 'project', 'charity', 'income']

const ALLOWED_TABS_BY_ROLE: Record<string, ReportTab[]> = {
  admin: ALL_TABS,
  director: ALL_TABS,
  foreman: ['project'],
}

const DEFAULT_TAB_BY_ROLE: Record<string, ReportTab> = {
  admin: 'office',
  director: 'office',
  foreman: 'project',
}

function ReportsPage() {
  const { t } = useTranslation('reports')
  const [searchParams, setSearchParams] = useSearchParams()
  const { role: userRole } = useAuth()

  const allowedTabs = (userRole && ALLOWED_TABS_BY_ROLE[userRole]) ?? ALL_TABS
  const defaultTab = (userRole && DEFAULT_TAB_BY_ROLE[userRole]) ?? 'office'

  // URL as single source of truth
  const month = searchParams.get('month') || DEFAULT_MONTH()
  const tabParam = searchParams.get('tab') as ReportTab | null
  const scopeParam = searchParams.get('scope')
  const rawTab: ReportTab = (tabParam || (scopeParam as ReportTab) || defaultTab) as ReportTab
  const selectedTab: ReportTab = allowedTabs.includes(rawTab) ? rawTab : defaultTab

  const isExpenseTab = selectedTab === 'office' || selectedTab === 'project' || selectedTab === 'charity'
  const isIncomeTab = selectedTab === 'income'

  // Sanitize URL only when tab is missing, invalid, or forbidden for role
  useEffect(() => {
    if (selectedTab === rawTab) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', selectedTab)
        if (selectedTab === 'income') next.delete('scope')
        else next.set('scope', selectedTab)
        next.delete('project')
        if (
          prev.get('tab') === next.get('tab') &&
          (selectedTab === 'income' ? !prev.has('scope') : prev.get('scope') === selectedTab) &&
          !prev.has('project')
        )
          return prev
        return next
      },
      { replace: true }
    )
  }, [selectedTab, rawTab, setSearchParams])

  const handleTabChange = (tab: ReportTab) => {
    if (!allowedTabs.includes(tab)) return
    setSearchParams(
      (prev) => {
        const currentTab = prev.get('tab') || (prev.get('scope') as ReportTab) || defaultTab
        const currentScope = prev.get('scope')
        const desiredScope = tab === 'income' ? null : tab
        if (
          currentTab === tab &&
          (desiredScope === null ? !prev.has('scope') : currentScope === desiredScope) &&
          !prev.has('project')
        )
          return prev
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        if (tab === 'income') next.delete('scope')
        else next.set('scope', tab)
        next.delete('project')
        return next
      },
      { replace: true }
    )
  }

  const handleMonthChange = (month: string) => {
    setSearchParams(
      (prev) => {
        const currentMonth = prev.get('month') || DEFAULT_MONTH()
        if (currentMonth === month) return prev
        const next = new URLSearchParams(prev)
        next.set('month', month)
        return next
      },
      { replace: true }
    )
  }

  const reportsData = useReportsData({
    selectedMonth: month,
    selectedTab,
    selectedProjectId: null,
  })

  // Warning message for income planned (no longer scope-dependent)
  const incomePlannedWarning = useMemo(() => {
    if (reportsData.warnings.incomePlannedOfficeOnly) {
      return t('warnings.incomePlannedOfficeOnly')
    }
    return undefined
  }, [reportsData.warnings.incomePlannedOfficeOnly, t])

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h1>{t('title')}</h1>
        <ReportsTabs activeTab={selectedTab} onTabChange={handleTabChange} allowedTabs={allowedTabs} />
      </div>

      <div className="reports-filters">
        <MonthGateBanner />
        <MonthSelector
          value={month}
          onChange={handleMonthChange}
          monthStatus={reportsData.monthPeriodStatus}
        />
      </div>

      {/* Error messages (tab-scoped) */}
      {isIncomeTab && reportsData.errors.financePeriod && (
        <div className="error-banner">
          {reportsData.errors.financePeriod}
        </div>
      )}
      {isExpenseTab && reportsData.errors.expensePlanned && (
        <div className="error-banner">
          {reportsData.errors.expensePlanned}
        </div>
      )}

      {/* Warning messages (tab-scoped) */}
      {isIncomeTab && reportsData.warnings.noFinancePeriod && (
        <div className="warning-banner">
          {t('warnings.noFinancePeriod')}
        </div>
      )}
      {isExpenseTab && reportsData.warnings.noBudgetPlan && (
        <div className="warning-banner">
          {t('warnings.noBudgetPlan')}
        </div>
      )}

      {/* Loading overlay (tab-scoped) */}
      {(reportsData.loading.monthPeriod ||
        (isExpenseTab && (reportsData.loading.expensePlanned || reportsData.loading.expenseActual)) ||
        (isIncomeTab &&
          (reportsData.loading.financePeriod ||
            reportsData.loading.incomePlanned ||
            reportsData.loading.incomeActual))) && (
        <div className="loading-overlay">
          <div className="loading-spinner">{t('loading')}</div>
        </div>
      )}

      {/* Income Section — only on income tab */}
      {isIncomeTab && (
        <IncomeSection
          planned={reportsData.incomePlanned}
          actual={reportsData.incomeActual}
          actualTotal={reportsData.incomeActualTotal}
          delta={reportsData.incomeDelta}
          deltaPercent={reportsData.incomeDeltaPercent ?? 0}
          monthStatus={reportsData.monthPeriodStatus}
          loading={{
            planned: reportsData.loading.incomePlanned,
            actual: reportsData.loading.incomeActual,
          }}
          showWarning={reportsData.warnings.incomePlannedOfficeOnly}
          warningMessage={incomePlannedWarning}
          incomeBySource={reportsData.incomeBySource}
          incomeDailyTotals={reportsData.incomeDailyTotals}
          selectedTab={selectedTab}
          showIncomePlanned={true}
        />
      )}

      {/* Expense Section — only on expense tabs (office / project / charity) */}
      {isExpenseTab && (
        <ExpenseSection
          planned={reportsData.expensePlanned}
          actual={reportsData.expenseActual}
          expenseFacts={reportsData.expenseFacts}
          actualTotal={reportsData.expenseActualTotal}
          delta={reportsData.expenseDelta}
          deltaPercent={reportsData.expenseDeltaPercent}
          monthStatus={reportsData.monthPeriodStatus}
          loading={{
            planned: reportsData.loading.expensePlanned,
            actual: reportsData.loading.expenseActual,
          }}
          expenseByCategory={reportsData.expenseByCategory}
          expenseDailyTotals={reportsData.expenseDailyTotals}
          showPlanned={true}
          showActual={true}
        />
      )}
    </div>
  )
}

export default ReportsPage

