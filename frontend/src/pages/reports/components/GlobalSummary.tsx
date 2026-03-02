import { useTranslation } from 'react-i18next'
import { formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface GlobalSummaryProps {
  incomeActualTotal: number
  expenseActualTotal: number | null
}

export function GlobalSummary({
  incomeActualTotal,
  expenseActualTotal,
}: GlobalSummaryProps) {
  const { t } = useTranslation('reports')
  const net = expenseActualTotal !== null ? incomeActualTotal - expenseActualTotal : null
  const isPositive = net !== null && net >= 0

  return (
    <div className="report-section global-summary-section">
      <h2>{t('globalSummary.title')}</h2>
      <div className="summary-card global-summary">
        <h3>{t('globalSummary.summaryTitle')}</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">{t('globalSummary.labels.incomeActual')}:</span>
            <span className="summary-value">{formatKGS(incomeActualTotal)}</span>
          </div>
          <div className="summary-item">
            <span className="summary-label">{t('globalSummary.labels.expenseActual')}:</span>
            <span className="summary-value">
              {expenseActualTotal !== null ? formatKGS(expenseActualTotal) : '—'}
            </span>
          </div>
          {net !== null && (
            <div className="summary-item">
              <span className="summary-label">{t('globalSummary.labels.net')}:</span>
              <span className={`summary-value ${isPositive ? 'positive' : 'negative'}`}>
                {formatKGS(net)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

