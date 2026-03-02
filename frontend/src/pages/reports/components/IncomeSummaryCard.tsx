import { useTranslation } from 'react-i18next'
import { formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface IncomeSummaryCardProps {
  planned: number
  actual: number
  delta: number
  deltaPercent: number | null
  showWarning?: boolean
  warningMessage?: string
  showPlanned?: boolean
}

export function IncomeSummaryCard({
  planned,
  actual,
  delta,
  deltaPercent,
  showWarning,
  warningMessage,
  showPlanned = true,
}: IncomeSummaryCardProps) {
  const { t } = useTranslation('reports')
  const isPositive = delta >= 0

  return (
    <div className="summary-card income-summary">
      <h3>{t('income.summaryTitle')}</h3>
      {showWarning && warningMessage && (
        <div className="warning-banner">
          {warningMessage}
        </div>
      )}
      <div className="summary-grid">
        {showPlanned && (
          <div className="summary-item">
            <span className="summary-label">{t('income.labels.planned')}:</span>
            <span className="summary-value">{formatKGS(planned)}</span>
          </div>
        )}
        <div className="summary-item">
          <span className="summary-label">{t('income.labels.actual')}:</span>
          <span className="summary-value">{formatKGS(actual)}</span>
        </div>
        {showPlanned && (
          <>
            <div className="summary-item">
              <span className="summary-label">{t('income.labels.delta')}:</span>
              <span className={`summary-value ${isPositive ? 'positive' : 'negative'}`}>
                {formatKGS(delta)}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('income.labels.deltaPercent')}:</span>
              <span className={`summary-value ${isPositive ? 'positive' : 'negative'}`}>
                {deltaPercent !== null ? `${deltaPercent.toFixed(2)}%` : '—'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

