import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListBudgetPlansQuery,
  useApproveBudgetPlanMutation,
  BudgetPlanListParams,
  BudgetPlan,
} from '@/shared/api/budgetingApi'
import { useListProjectsQuery } from '@/shared/api/projectsApi'
import { useListBudgetLinesQuery } from '@/shared/api/budgetingApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { formatCurrency, getErrorMessage } from '@/shared/lib/utils'
import './SubmittedProjectPlansPage.css'

interface ApprovalFormState {
  planId: number | null
  comments: string
  error: string | null
}

function SubmittedProjectPlansPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<BudgetPlanListParams>({
    scope: 'PROJECT',
    status: 'SUBMITTED',
  })
  const [approvalForm, setApprovalForm] = useState<ApprovalFormState>({
    planId: null,
    comments: '',
    error: null,
  })

  const { data, isLoading, error, refetch } = useListBudgetPlansQuery(filters)
  const { data: projectsData } = useListProjectsQuery()
  const [approveBudgetPlan, { isLoading: isApproving }] = useApproveBudgetPlanMutation()

  // Fetch all budget lines (we'll filter by plan IDs client-side)
  const { data: allLinesData } = useListBudgetLinesQuery()

  // Calculate totals for each plan
  const finalTotals = useMemo(() => {
    const totals: Record<number, number> = {}
    const planIds = data?.results.map((p) => p.id) || []
    
    // Filter lines for our plans and calculate totals
    allLinesData?.results.forEach((line) => {
      if (planIds.includes(line.plan)) {
        if (!totals[line.plan]) {
          totals[line.plan] = 0
        }
        totals[line.plan] += parseFloat(line.amount_planned || '0')
      }
    })
    
    return totals
  }, [data, allLinesData])

  const handleApprove = async (planId: number) => {
    setApprovalForm({ planId, comments: '', error: null })
  }

  const handleApproveSubmit = async () => {
    if (!approvalForm.planId) return

    setApprovalForm((prev) => ({ ...prev, error: null }))
    try {
      await approveBudgetPlan({
        id: approvalForm.planId,
        comments: approvalForm.comments || undefined,
      }).unwrap()
      setApprovalForm({ planId: null, comments: '', error: null })
      refetch()
    } catch (err: any) {
      setApprovalForm((prev) => ({
        ...prev,
        error: getErrorMessage(err),
      }))
    }
  }

  const handleApproveCancel = () => {
    setApprovalForm({ planId: null, comments: '', error: null })
  }

  const getStatusBadge = (status: string) => {
    const statusClass = status.toLowerCase()
    return (
      <span className={`status-badge status-${statusClass}`}>
        {t(`submittedPlans.statuses.${status}`)}
      </span>
    )
  }

  const columns = [
    { key: 'project', label: t('submittedPlans.columns.project') },
    { key: 'month', label: t('submittedPlans.columns.month') },
    { key: 'totalPlanned', label: t('submittedPlans.columns.totalPlanned') },
    { key: 'status', label: t('submittedPlans.columns.status') },
    { key: 'actions', label: t('submittedPlans.columns.actions') },
  ]

  const tableData =
    data?.results.map((plan: BudgetPlan) => ({
      ...plan,
      project: plan.project_name || '-',
      month: plan.period_month || '-',
      totalPlanned: formatCurrency(finalTotals[plan.id] || 0),
      status: getStatusBadge(plan.status),
      actions:
        approvalForm.planId === plan.id ? (
          <div className="approval-form">
            {approvalForm.error && (
              <div className="approval-error">{approvalForm.error}</div>
            )}
            <textarea
              placeholder={t('submittedPlans.approve.commentsPlaceholder')}
              value={approvalForm.comments}
              onChange={(e) =>
                setApprovalForm((prev) => ({
                  ...prev,
                  comments: e.target.value,
                }))
              }
              rows={3}
              className="approval-comments"
            />
            <div className="approval-actions">
              <Button
                onClick={handleApproveSubmit}
                disabled={isApproving}
                variant="primary"
              >
                {isApproving
                  ? t('submittedPlans.buttons.approving')
                  : t('submittedPlans.buttons.approve')}
              </Button>
              <Button
                onClick={handleApproveCancel}
                disabled={isApproving}
                variant="secondary"
              >
                {t('submittedPlans.buttons.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={() => handleApprove(plan.id)} variant="primary" size="small">
            {t('submittedPlans.buttons.approve')}
          </Button>
        ),
    })) || []

  const errorStatus = (error as any)?.status

  if (error) {
    if (errorStatus === 401) {
      return (
        <div className="submitted-plans-page">
          <div className="error">
            <p>{t('users.error401')}</p>
          </div>
        </div>
      )
    }

    if (errorStatus === 403) {
      return (
        <div className="submitted-plans-page">
          <div className="error">
            <p>{t('users.error403')}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="submitted-plans-page">
        <div className="error">
          <p>{t('submittedPlans.error')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="submitted-plans-page">
      <div className="page-header">
        <h2>{t('submittedPlans.title')}</h2>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="filter-month">{t('submittedPlans.filters.month')}</label>
          <input
            id="filter-month"
            type="month"
            value={filters.month || ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                month: e.target.value || undefined,
              }))
            }
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-project">{t('submittedPlans.filters.project')}</label>
          <select
            id="filter-project"
            value={filters.project || ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                project: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
          >
            <option value="">-</option>
            {projectsData?.results.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-status">{t('submittedPlans.filters.status')}</label>
          <select
            id="filter-status"
            value={filters.status || 'SUBMITTED'}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value || undefined,
              }))
            }
          >
            <option value="SUBMITTED">{t('submittedPlans.statuses.SUBMITTED')}</option>
            <option value="APPROVED">{t('submittedPlans.statuses.APPROVED')}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">{t('submittedPlans.loading')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">{t('submittedPlans.emptyState')}</div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

export default SubmittedProjectPlansPage

