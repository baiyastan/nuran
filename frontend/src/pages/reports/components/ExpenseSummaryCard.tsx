import { useTranslation } from 'react-i18next'
import { formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface ExpenseSummaryCardProps {
  planned: number
  actual: number | null
  delta: number | null
  deltaPercent: number | null
  /** When false, hides the delta % row (simpler summary for field roles). */
  showDeltaPercent?: boolean
}

function ExpenseSummaryCard({
  planned,
  actual,
  delta,
  deltaPercent,
  showDeltaPercent = true,
}: ExpenseSummaryCardProps) {
  const { t } = useTranslation('reports')
  const deltaToneClass =
    delta === null ? '' : delta > 0 ? 'negative' : delta < 0 ? 'positive' : 'neutral'

  return (
    <div className="summary-card expense-summary">
      <h3>{t('expense.summaryTitle')}</h3>
      <div className="summary-grid">
        <div className="summary-item">
          <span className="summary-label">{t('expense.labels.planned')}:</span>
          <span className="summary-value summary-value--tabular">{formatKGS(planned)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">{t('expense.labels.actual')}:</span>
          <span className="summary-value summary-value--tabular">
            {actual !== null ? formatKGS(actual) : '—'}
          </span>
        </div>
        {delta !== null && (
          <div className="summary-item">
            <span className="summary-label">{t('expense.labels.delta')}:</span>
            <span className={`summary-value summary-value--tabular ${deltaToneClass}`}>
              {formatKGS(delta)}
            </span>
          </div>
        )}
        {showDeltaPercent && delta !== null && (
          <div className="summary-item">
            <span className="summary-label">{t('expense.labels.deltaPercent')}:</span>
            <span className={`summary-value summary-value--tabular ${deltaToneClass}`}>
              {deltaPercent !== null ? `${deltaPercent.toFixed(2)}%` : '—'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export { ExpenseSummaryCard }

