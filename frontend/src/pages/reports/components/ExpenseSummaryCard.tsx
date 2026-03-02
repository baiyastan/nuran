import { useTranslation } from 'react-i18next'
import { formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface ExpenseSummaryCardProps {
  planned: number
  actual: number | null
  delta: number | null
  deltaPercent: number | null
}

function ExpenseSummaryCard({
  planned,
  actual,
  delta,
  deltaPercent,
}: ExpenseSummaryCardProps) {
  const { t } = useTranslation('reports')
  const isOverBudget = delta !== null && delta > 0

  return (
    <div className="summary-card expense-summary">
      <h3>{t('expense.summaryTitle')}</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">{t('expense.labels.planned')}:</span>
          <span className="summary-value">{formatKGS(planned)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('expense.labels.actual')}:</span>
          <span className="summary-value">
            {actual !== null ? formatKGS(actual) : '—'}
          </span>
        </div>
        {delta !== null && (
          <>
            <div className="summary-item">
              <span className="summary-label">{t('expense.labels.delta')}:</span>
              <span className={`summary-value ${isOverBudget ? 'negative' : 'positive'}`}>
                {formatKGS(delta)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('expense.labels.deltaPercent')}:</span>
              <span className={`summary-value ${isOverBudget ? 'negative' : 'positive'}`}>
                {deltaPercent !== null ? `${deltaPercent.toFixed(2)}%` : '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export { ExpenseSummaryCard }

