import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { MonthSelector } from './components/MonthSelector'
import { GlobalSummary } from './components/GlobalSummary'
import { ForemanProjectExpenseReport } from './components/ForemanProjectExpenseReport'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import type { ReportCurrency } from '@/shared/api/reportsApi'
import './ReportsPage.css'

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)

function parseCurrency(raw: string | null): ReportCurrency {
  return raw === 'USD' ? 'USD' : 'KGS'
}

function ReportsPage() {
  const { t } = useTranslation('reports')
  const { role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL as single source of truth
  const month = searchParams.get('month') || DEFAULT_MONTH()
  const currency = parseCurrency(searchParams.get('currency'))

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

  const handleCurrencyChange = (next: ReportCurrency) => {
    setSearchParams(
      (prev) => {
        const current = parseCurrency(prev.get('currency'))
        if (current === next) return prev
        const nextParams = new URLSearchParams(prev)
        nextParams.set('currency', next)
        return nextParams
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
        <div className="reports-filters__controls">
          <MonthSelector
            value={month}
            onChange={handleMonthChange}
            monthStatus={
              role === 'director' ? null : (monthPeriod?.status ?? null)
            }
          />
          <div className="reports-currency-toggle" role="group" aria-label={t('filters.currency', { defaultValue: 'Валюта' })}>
            <span className="reports-currency-toggle__label">
              {t('filters.currency', { defaultValue: 'Валюта' })}:
            </span>
            {([
              ['KGS', t('filters.currencyKgs', { defaultValue: 'Сом (KGS)' })],
              ['USD', t('filters.currencyUsd', { defaultValue: 'Доллар (USD)' })],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  currency === value
                    ? 'reports-currency-toggle__button reports-currency-toggle__button--active'
                    : 'reports-currency-toggle__button'
                }
                aria-pressed={currency === value}
                onClick={() => handleCurrencyChange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {role === 'foreman' ? (
        <ForemanProjectExpenseReport
          month={month}
          monthStatus={monthPeriod?.status ?? null}
          currency={currency}
        />
      ) : (
        <GlobalSummary month={month} currency={currency} />
      )}
    </div>
  )
}

export default ReportsPage

