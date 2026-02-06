import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'
import { useListPlanItemsQuery } from '@/shared/api/planItemsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { formatDate } from '@/shared/lib/utils'
import { CreatePlanItemForm } from '@/features/plan-item-create/CreatePlanItemForm'
import { SubmitPlanPeriodButton } from '@/features/plan-period-submit/SubmitPlanPeriodButton'
import { ApprovePlanPeriodButton } from '@/features/plan-period-approve/ApprovePlanPeriodButton'
import { LockPlanPeriodButton } from '@/features/plan-period-lock/LockPlanPeriodButton'
import './PlanPeriodDetailsPage.css'

function PlanPeriodDetailsPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const planPeriodId = id ? parseInt(id, 10) : 0
  const { data: planPeriod, isLoading: isLoadingPeriod, error: periodError } = useGetPlanPeriodQuery(planPeriodId)
  const { data: planItems, isLoading: isLoadingItems } = useListPlanItemsQuery({
    plan_period_id: planPeriodId,
  })
  const { role } = useAuth()

  const canCreatePlanItem = 
    (role === 'foreman' || role === 'director' || role === 'admin') &&
    planPeriod?.status !== 'locked'

  const totalAmount = planItems?.results.reduce((sum, item) => sum + Number(item.amount), 0) || 0

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: '#6c757d',
      submitted: '#0d6efd',
      approved: '#198754',
      locked: '#dc3545',
    }
    return (
      <span
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          backgroundColor: colors[status] || '#6c757d',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        {t(`planPeriods.statuses.${status}` as any) || status.toUpperCase()}
      </span>
    )
  }

  const columns = [
    { key: 'title', label: t('planPeriodDetails.columns.title') },
    { key: 'category', label: t('planPeriodDetails.columns.category') },
    { key: 'qty', label: t('planPeriodDetails.columns.quantity') },
    { key: 'unit', label: t('planPeriodDetails.columns.unit') },
    { key: 'amount', label: t('planPeriodDetails.columns.amount') },
    { key: 'note', label: t('planPeriodDetails.columns.note') },
    { key: 'created_by_username', label: t('planPeriodDetails.columns.createdBy') },
    { key: 'created_at', label: t('planPeriodDetails.columns.createdAt') },
  ]

  const tableData = planItems?.results.map((item) => ({
    ...item,
    amount: `$${Number(item.amount).toLocaleString()}`,
    created_at: formatDate(item.created_at),
  })) || []

  if (isLoadingPeriod) {
    return <div className="loading">{t('planPeriodDetails.loading')}</div>
  }

  if (periodError || !planPeriod) {
    return <div className="error">{t('planPeriodDetails.error')}</div>
  }

  return (
    <div className="plan-period-details-page">
      <div className="page-header">
        <div>
          <h2>
            {t('planPeriodDetails.title')} {planPeriod.project_name} - {planPeriod.period}
          </h2>
          <div className="status-banner">
            {getStatusBadge(planPeriod.status)}
            {planPeriod.comments && (
              <p className="comments">{planPeriod.comments}</p>
            )}
          </div>
        </div>
        <div className="actions">
          {role === 'foreman' && planPeriod.status === 'draft' && (
            <SubmitPlanPeriodButton planPeriodId={planPeriodId} />
          )}
          {role === 'director' && planPeriod.status === 'submitted' && (
            <ApprovePlanPeriodButton planPeriodId={planPeriodId} />
          )}
          {role === 'admin' && planPeriod.status === 'approved' && (
            <LockPlanPeriodButton planPeriodId={planPeriodId} />
          )}
        </div>
      </div>

      <div className="summary">
        <div className="summary-item">
          <span className="label">{t('planPeriodDetails.summary.totalItems')}</span>
          <span className="value">{planItems?.results.length || 0}</span>
        </div>
        <div className="summary-item">
          <span className="label">{t('planPeriodDetails.summary.totalAmount')}</span>
          <span className="value">${totalAmount.toLocaleString()}</span>
        </div>
      </div>

      {canCreatePlanItem && (
        <div className="create-section">
          <h3>{t('planPeriodDetails.form.title')}</h3>
          <CreatePlanItemForm planPeriodId={planPeriodId} />
        </div>
      )}

      <div className="plan-items-section">
        <h3>{t('planPeriodDetails.items.title')}</h3>
        {isLoadingItems ? (
          <div className="loading">{t('planPeriodDetails.loadingItems')}</div>
        ) : !planItems?.results.length ? (
          <div className="empty-state">{t('planPeriodDetails.items.empty')}</div>
        ) : (
          <Table columns={columns} data={tableData} />
        )}
      </div>
    </div>
  )
}

export default PlanPeriodDetailsPage

