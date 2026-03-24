import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { MonthSelector } from './components/MonthSelector'
import { GlobalSummary } from './components/GlobalSummary'
import { ForemanProjectExpenseReport } from './components/ForemanProjectExpenseReport'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import './ReportsPage.css'

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)

function ReportsPage() {
  const { t } = useTranslation('reports')
  const { role } = useAuth()
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

  useEffect(() => {
    if (role !== 'foreman') return
    setSearchParams(
      (prev) => {
        if (!prev.has('tab') && !prev.has('scope')) return prev
        const next = new URLSearchParams(prev)
        next.delete('tab')
        next.delete('scope')
        return next
      },
      { replace: true }
    )
  }, [role, setSearchParams])

  return (
    <div className="reports-page">
      <div className="reports-header">
        <h1>{t('title')}</h1>
      </div>

      <div className="reports-filters">
        {role !== 'director' && <MonthGateBanner showManageButton={false} />}
        <MonthSelector
          value={month}
          onChange={handleMonthChange}
          monthStatus={
            role === 'director' ? null : (monthPeriod?.status ?? null)
          }
        />
      </div>

      {role === 'foreman' ? (
        <ForemanProjectExpenseReport
          month={month}
          monthStatus={monthPeriod?.status ?? null}
        />
      ) : (
        <GlobalSummary month={month} />
      )}
    </div>
  )
}

export default ReportsPage

