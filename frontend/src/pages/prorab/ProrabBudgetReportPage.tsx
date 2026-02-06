import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'
import {
  useGetProjectBudgetPlanQuery,
  useGetBudgetPlanReportQuery,
} from '@/shared/api/budgetingApi'
import { formatKGS, getErrorMessage } from '@/shared/lib/utils'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import './ProrabBudgetReportPage.css'

function ProrabBudgetReportPage() {
  const { t } = useTranslation()
  const { projectId, periodId } = useParams<{ projectId: string; periodId: string }>()
  const navigate = useNavigate()
  const projectIdNum = projectId ? parseInt(projectId, 10) : 0
  const periodIdNum = periodId ? parseInt(periodId, 10) : 0

  // Fetch PlanPeriod to get month
  const { data: planPeriod, isLoading: isLoadingPeriod } = useGetPlanPeriodQuery(periodIdNum)

  // Get budget plan for this project and month
  const { data: budgetPlan, isLoading: isLoadingPlan } = useGetProjectBudgetPlanQuery(
    {
      month: planPeriod?.period || '',
      projectId: projectIdNum,
    },
    { skip: !planPeriod?.period }
  )

  // Get report for the budget plan
  const { data: reportData, isLoading: isLoadingReport, error } = useGetBudgetPlanReportQuery(
    budgetPlan?.id || 0,
    { skip: !budgetPlan?.id }
  )

  const reportColumns = [
    { key: 'category', label: t('budgetReport.columns.category') },
    { key: 'planned', label: t('budgetReport.columns.planned') },
    { key: 'spent', label: t('budgetReport.columns.spent') },
    { key: 'balance', label: t('budgetReport.columns.balance') },
    { key: 'percent', label: t('budgetReport.columns.percent') },
  ]

  const reportTableData =
    reportData?.rows.map((row) => ({
      category: row.category_name,
      planned: formatKGS(parseFloat(row.planned)),
      spent: formatKGS(parseFloat(row.spent)),
      balance: formatKGS(parseFloat(row.balance)),
      percent: row.percent !== null ? `${row.percent.toFixed(2)}%` : '-',
    })) || []

  if (isLoadingPeriod || isLoadingPlan || isLoadingReport) {
    return (
      <div className="prorab-budget-report-page">
        <div className="loading">{t('budgetReport.loading')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="prorab-budget-report-page">
        <div className="error">{getErrorMessage(error)}</div>
      </div>
    )
  }

  if (!budgetPlan) {
    return (
      <div className="prorab-budget-report-page">
        <div className="empty-state">{t('budgetReport.emptyState')}</div>
      </div>
    )
  }

  if (!reportData) {
    return (
      <div className="prorab-budget-report-page">
        <div className="empty-state">{t('budgetReport.emptyState')}</div>
      </div>
    )
  }

  return (
    <div className="prorab-budget-report-page">
      <div className="page-header">
        <h2>{t('budgetReport.title')}</h2>
        <Button onClick={() => navigate(`/prorab/projects/${projectId}/plan-periods`)} variant="secondary">
          {t('prorab.planPeriods.buttons.backToProjects')}
        </Button>
      </div>

      <div className="report-info">
        <div className="info-row">
          <strong>{t('budgetReport.plan.project')}:</strong>
          <span>{reportData.plan.project_name}</span>
        </div>
        <div className="info-row">
          <strong>{t('budgetReport.plan.month')}:</strong>
          <span>{reportData.plan.period_month}</span>
        </div>
        <div className="info-row">
          <strong>{t('budgetReport.plan.status')}:</strong>
          <span>{reportData.plan.status}</span>
        </div>
      </div>

      <div className="report-section">
        <Table columns={reportColumns} data={reportTableData} />
        <div className="report-totals">
          <div className="total-row">
            <strong>{t('budgetReport.totals.planned')}:</strong>
            <span>{formatKGS(parseFloat(reportData.totals.planned))}</span>
          </div>
          <div className="total-row">
            <strong>{t('budgetReport.totals.spent')}:</strong>
            <span>{formatKGS(parseFloat(reportData.totals.spent))}</span>
          </div>
          <div className="total-row">
            <strong>{t('budgetReport.totals.balance')}:</strong>
            <span>{formatKGS(parseFloat(reportData.totals.balance))}</span>
          </div>
          <div className="total-row">
            <strong>{t('budgetReport.totals.percent')}:</strong>
            <span>
              {reportData.totals.percent !== null
                ? `${reportData.totals.percent.toFixed(2)}%`
                : '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProrabBudgetReportPage

