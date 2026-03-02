import { useTranslation } from 'react-i18next'
import { IncomeSummaryCard } from './IncomeSummaryCard'
import { IncomePlannedTable } from './IncomePlannedTable'
import { IncomeActualTable } from './IncomeActualTable'
import { IncomePlannedVsActualChart } from './charts/IncomePlannedVsActualChart'
import { IncomeDailyChart } from './charts/IncomeDailyChart'
import { ReportTab } from '../types/reports.types'
import './Section.css'

interface IncomeSectionProps {
  planned: {
    period: {
      year: number | null
      month: number | null
      status: string | null
    } | null
    summary: {
      total_amount: string
      items_count: number
    }
    items: Array<{
      id: number
      year: number
      month: number
      source: { id: number, name: string }
      amount: string
    }>
    total: number
  }
  actual: Array<{
    id: number
    finance_period: number
    finance_period_fund_kind: string
    finance_period_month: string
    source?: { id: number, name: string } | null
    amount: string
    received_at: string
    comment: string
    created_by: number
    created_by_username: string
  }>
  actualTotal: number
  delta: number
  deltaPercent: number
  monthStatus: 'OPEN' | 'LOCKED' | null
  loading: {
    planned: boolean
    actual: boolean
  }
  showWarning?: boolean
  warningMessage?: string
  incomeBySource: Array<{
    source_id: number
    source_name: string
    planned: number
    actual: number
  }>
  incomeDailyTotals: Array<{
    date: string
    total: number
  }>
  selectedTab: ReportTab
  showIncomePlanned?: boolean
}

export function IncomeSection({
  planned,
  actual,
  actualTotal,
  delta,
  deltaPercent,
  monthStatus,
  loading,
  showWarning,
  warningMessage,
  incomeBySource,
  incomeDailyTotals,
  selectedTab: _selectedTab,
  showIncomePlanned: showIncomePlannedProp = true,
}: IncomeSectionProps) {
  const { t } = useTranslation('reports')

  return (
    <div className="report-section income-section">
      <h2>{t('income.title')}</h2>
      <IncomeSummaryCard
        planned={planned.total}
        actual={actualTotal}
        delta={delta}
        deltaPercent={deltaPercent}
        showWarning={showWarning}
        warningMessage={warningMessage}
        showPlanned={showIncomePlannedProp}
      />

      {showIncomePlannedProp && (
        <IncomePlannedVsActualChart data={incomeBySource} />
      )}
      <IncomeDailyChart data={incomeDailyTotals} />

      <div className="tables-container">
        {showIncomePlannedProp && (
          <div className="table-section">
            <h3>{t('income.planned')}</h3>
            <IncomePlannedTable
              items={planned.items}
              monthStatus={monthStatus}
              loading={loading.planned}
            />
          </div>
        )}

        <div className="table-section">
          <h3>{t('income.actual')}</h3>
          <IncomeActualTable
            items={actual}
            monthStatus={monthStatus}
            loading={loading.actual}
          />
        </div>
      </div>
    </div>
  )
}

