import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { MonthSelector } from './components/MonthSelector'
import { GlobalSummary } from './components/GlobalSummary'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import './ReportsPage.css'

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)

function ReportsPage() {
  const { t } = useTranslation('reports')
  const [searchParams, setSearchParams] = useSearchParams()

  // URL as single source of truth
  const month = searchParams.get('month') || DEFAULT_MONTH()

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

  const { data: monthPeriod } = useGetMonthPeriodQuery(month)

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h1>{t('title')}</h1>
      </div>

      <div className="reports-filters">
        <MonthGateBanner showManageButton={false} />
        <MonthSelector
          value={month}
          onChange={handleMonthChange}
          monthStatus={monthPeriod?.status ?? null}
        />
      </div>

      {/* Global 3-KPI summary (Income fact, Expense fact, Difference) */}
      <GlobalSummary month={month} />
    </div>
  )
}

export default ReportsPage

