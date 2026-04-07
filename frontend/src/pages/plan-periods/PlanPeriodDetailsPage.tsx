import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetPlanPeriodQuery,
  useUnlockPlanPeriodMutation,
  useReturnPlanPeriodToDraftMutation,
} from '@/shared/api/planPeriodsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useListPlanItemsQuery } from '@/shared/api/planItemsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatDate } from '@/shared/lib/utils'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
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
  const [unlockPlanPeriod, { isLoading: isUnlocking }] = useUnlockPlanPeriodMutation()
  const [returnPlanPeriodToDraft, { isLoading: isReturning }] = useReturnPlanPeriodToDraftMutation()
  
  // Check month gate status
  const { data: monthPeriod } = useGetMonthPeriodQuery(planPeriod?.period || '')
  const isMonthOpen = monthPeriod?.status === 'OPEN'

  // Align action visibility with backend workflow + month gate.
  const canCreatePlanItem = Boolean(
    isMonthOpen &&
      planPeriod?.status === 'draft' &&
      (role === 'foreman' || role === 'admin')
  )
  const canSubmit = Boolean(isMonthOpen && role === 'foreman' && planPeriod?.status === 'draft')
  const canApprove = Boolean(isMonthOpen && (role === 'director' || role === 'admin') && planPeriod?.status === 'submitted')
  const canLock = Boolean(isMonthOpen && role === 'admin' && planPeriod?.status === 'approved')
  const canUnlock = Boolean(isMonthOpen && role === 'admin' && planPeriod?.status === 'locked')
  const canReturnToDraft = Boolean(
    isMonthOpen &&
      (role === 'director' || role === 'admin') &&
      (planPeriod?.status === 'submitted' || planPeriod?.status === 'approved')
  )

  const handleUnlock = async () => {
    try {
      await unlockPlanPeriod(planPeriodId).unwrap()
    } catch {
      // Action-level error is surfaced via global error handling.
    }
  }

  const handleReturnToDraft = async () => {
    try {
      await returnPlanPeriodToDraft({ id: planPeriodId }).unwrap()
    } catch {
      // Action-level error is surfaced via global error handling.
    }
  }

  const totalAmount = planItems?.results.reduce((sum, item) => sum + Number(item.amount), 0) || 0

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    const colors: Record<string, string> = {
      draft: '#6c757d',
      submitted: '#0d6efd',
      approved: '#198754',
      locked: '#dc3545',
      open: '#198754',
      closed: '#6c757d',
    }
    return (
      <span
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          backgroundColor: colors[statusLower] || '#6c757d',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        {t(`planPeriods.statuses.${statusLower}` as 'planPeriods.statuses.draft' | 'planPeriods.statuses.submitted' | 'planPeriods.statuses.approved' | 'planPeriods.statuses.locked' | 'planPeriods.statuses.open' | 'planPeriods.statuses.closed') || status.toUpperCase()}
      </span>
    )
  }

  const columns = [
    { key: 'title', label: t('planPeriodDetails.columns.title') },
    { key: 'amount', label: t('planPeriodDetails.columns.amount') },
    { key: 'created_by_username', label: t('planPeriodDetails.columns.createdBy') },
    { key: 'created_at', label: t('planPeriodDetails.columns.createdAt') },
  ]

  const tableData = planItems?.results.map((item) => ({
    title: item.title,
    amount: formatMoneyKGS(item.amount),
    created_by_username: item.created_by_username,
    created_at: formatDate(item.created_at),
  })) || []

  if (isLoadingPeriod) {
    return <LoadingScreen />
  }

  if (periodError || !planPeriod) {
    return <div className="error">{t('planPeriodDetails.error')}</div>
  }

  // Foreman can only access project plans
  if (role === 'foreman' && planPeriod.fund_kind !== 'project') {
    return <div className="error">{t('planPeriodDetails.accessDenied') || 'Access denied. You can only view project plans.'}</div>
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
          {canSubmit && (
            <SubmitPlanPeriodButton planPeriodId={planPeriodId} />
          )}
          {canApprove && (
            <ApprovePlanPeriodButton planPeriodId={planPeriodId} />
          )}
          {canLock && (
            <LockPlanPeriodButton planPeriodId={planPeriodId} />
          )}
          {canUnlock && (
            <Button onClick={handleUnlock} disabled={isUnlocking} variant="secondary">
              {isUnlocking ? 'Unlocking...' : 'Unlock Period'}
            </Button>
          )}
          {canReturnToDraft && (
            <Button onClick={handleReturnToDraft} disabled={isReturning} variant="secondary">
              {isReturning ? 'Returning...' : 'Return to Draft'}
            </Button>
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
          <span className="value">{formatMoneyKGS(totalAmount)}</span>
        </div>
      </div>

      {!isMonthOpen && (
        <div className="month-closed-message" style={{ 
          padding: '1rem', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffc107', 
          borderRadius: '4px',
          color: '#856404',
          marginBottom: '1rem'
        }}>
          {t('planPeriodDetails.monthLockedNoPlanEdit')}
        </div>
      )}
      {canCreatePlanItem && (
        <div className="create-section">
          <h3>{t('planPeriodDetails.form.title')}</h3>
          <CreatePlanItemForm planPeriodId={planPeriodId} />
        </div>
      )}

      <div className="plan-items-section">
        <h3>{t('planPeriodDetails.items.title')}</h3>
        {isLoadingItems ? (
          <TableSkeleton columnCount={4} />
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

