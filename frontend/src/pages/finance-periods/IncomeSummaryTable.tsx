import { useTranslation } from 'react-i18next'
import { useGetIncomeSummaryQuery } from '@/shared/api/financePeriodsApi'
import { formatKGS } from '@/shared/lib/utils'
import { Table } from '@/shared/ui/Table/Table'
import './IncomeSummaryTable.css'

interface IncomeSummaryTableProps {
  financePeriodId: number
}

export function IncomeSummaryTable({ financePeriodId }: IncomeSummaryTableProps) {
  const { t } = useTranslation('financePeriodDetails')
  const { data, isLoading, error } = useGetIncomeSummaryQuery(financePeriodId)

  if (isLoading) {
    return (
      <div className="income-summary-section">
        <div className="loading">{t('loading', { defaultValue: 'Loading...' })}</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="income-summary-section">
        <div className="error">{t('error.summary', { defaultValue: 'Error loading income summary' })}</div>
      </div>
    )
  }

  const columns = [
    { key: 'source', label: t('incomeSummary.columns.source', { defaultValue: 'Source' }) },
    { key: 'planned', label: t('incomeSummary.columns.planned', { defaultValue: 'Planned' }) },
    { key: 'actual', label: t('incomeSummary.columns.actual', { defaultValue: 'Actual' }) },
    { key: 'diff', label: t('incomeSummary.columns.diff', { defaultValue: 'Diff' }) },
  ]

  const tableData = data.rows.map((row) => {
    const diffNum = parseFloat(row.diff)
    const diffClass = diffNum < 0 ? 'neg' : diffNum > 0 ? 'pos' : ''
    return {
      source: row.source_name,
      planned: formatKGS(row.planned),
      actual: formatKGS(row.actual),
      diff: (
        <span className={diffClass}>
          {formatKGS(row.diff)}
        </span>
      ),
    }
  })

  const diffTotalNum = parseFloat(data.diff_total)
  const diffTotalClass = diffTotalNum < 0 ? 'neg' : diffTotalNum > 0 ? 'pos' : ''

  return (
    <div className="income-summary-section">
      <h3>{t('incomeSummary.title', { defaultValue: 'Income Summary by Source' })}</h3>
      
      {/* Totals Section */}
      <div className="income-summary-totals">
        <div className="summary-card">
          <div className="summary-card__label">
            {t('incomeSummary.totals.planned', { defaultValue: 'Planned Total' })}
          </div>
          <div className="summary-card__value">
            {formatKGS(data.planned_total)}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card__label">
            {t('incomeSummary.totals.actual', { defaultValue: 'Actual Total' })}
          </div>
          <div className="summary-card__value">
            {formatKGS(data.actual_total)}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card__label">
            {t('incomeSummary.totals.diff', { defaultValue: 'Diff Total' })}
          </div>
          <div className={`summary-card__value ${diffTotalClass}`}>
            {formatKGS(data.diff_total)}
          </div>
        </div>
      </div>

      {/* Table Section */}
      {data.rows.length === 0 ? (
        <div className="empty">{t('incomeSummary.empty', { defaultValue: 'No income data available' })}</div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

