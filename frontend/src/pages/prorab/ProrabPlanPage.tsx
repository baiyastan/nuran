import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useGetProrabPlanQuery,
  useDeleteProrabPlanItemMutation,
  useSubmitProrabPlanMutation,
} from '@/shared/api/prorabApi'
import {
  useGetProrabPlanSummaryQuery,
  useGetProrabPlanExpensesQuery,
} from '@/shared/api/actualExpensesApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import { CreateProrabPlanItemForm } from '@/features/prorab-plan-item-create/CreateProrabPlanItemForm'
import { EditProrabPlanItemForm } from '@/features/prorab-plan-item-edit/EditProrabPlanItemForm'
import './ProrabPlanPage.css'

function ProrabPlanPage() {
  const { t } = useTranslation()
  const { periodId } = useParams<{ periodId: string }>()
  const navigate = useNavigate()
  const periodIdNum = periodId ? parseInt(periodId, 10) : 0
  const { data: plan, isLoading, error, refetch } = useGetProrabPlanQuery(periodIdNum)
  const [deletePlanItem] = useDeleteProrabPlanItemMutation()
  const [submitPlan] = useSubmitProrabPlanMutation()
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  
  // Fetch summary and expenses if plan exists
  const { data: summary } = useGetProrabPlanSummaryQuery(plan?.id || 0, {
    skip: !plan?.id,
  })
  const { data: expenses } = useGetProrabPlanExpensesQuery(plan?.id || 0, {
    skip: !plan?.id,
  })

  const errorStatus = (error as any)?.status

  const isEditable = plan 
    ? plan.status === 'draft'
    : false

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: '#6c757d',
      submitted: '#0d6efd',
      approved: '#198754',
      rejected: '#dc3545',
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
        {t(`prorab.plan.statuses.${status}` as any) || status.toUpperCase()}
      </span>
    )
  }

  const handleDeleteItem = async (itemId: number) => {
    if (!plan) return
    
    if (!window.confirm(t('prorab.plan.items.confirmDelete'))) {
      return
    }

    try {
      await deletePlanItem({ planId: plan.id, periodId: periodIdNum, itemId }).unwrap()
      // refetch() not needed - RTK Query will auto-refetch due to tag invalidation
    } catch (err: any) {
      const errorStatus = (err as any)?.status
      if (errorStatus === 409) {
        alert(t('prorab.plan.errors.periodClosed'))
      } else {
        alert(getErrorMessage(err))
      }
    }
  }

  const handleSubmit = async () => {
    if (!plan) return

    if (!window.confirm(t('prorab.plan.confirmSubmit'))) {
      return
    }

    try {
      await submitPlan(plan.id).unwrap()
      // refetch() not needed - RTK Query will auto-refetch due to tag invalidation
    } catch (err: any) {
      const errorStatus = (err as any)?.status
      if (errorStatus === 409) {
        alert(t('prorab.plan.errors.periodClosed'))
      } else {
        alert(getErrorMessage(err))
      }
    }
  }

  if (error) {
    if (errorStatus === 401) {
      return (
        <div className="prorab-plan-page">
          <div className="error">
            <p>{t('prorab.error401')}</p>
            <Button onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </Button>
          </div>
        </div>
      )
    }
    
    if (errorStatus === 403) {
      return (
        <div className="prorab-plan-page">
          <div className="error">
            <p>{t('prorab.error403')}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="prorab-plan-page">
        <div className="error">
          <p>{getErrorMessage(error)}</p>
        </div>
      </div>
    )
  }

  const columns = [
    { key: 'category_name', label: t('prorab.plan.items.columns.category') },
    { key: 'name', label: t('prorab.plan.items.columns.name') },
    { key: 'amount', label: t('prorab.plan.items.columns.amount') },
    ...(isEditable ? [{ key: 'actions', label: t('prorab.plan.items.columns.actions') }] : []),
  ]

  const formatAmount = (amount: string | number): string => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    return `${num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} сом`
  }

  const tableData = plan?.items
    .filter((item) => editingItemId !== item.id)
    .map((item) => {
      const row: any = {
        ...item,
        category_name: item.category_name || '-',
        amount: formatAmount(item.amount),
      }

      if (isEditable) {
        row.actions = (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              size="small"
              onClick={() => setEditingItemId(item.id)}
            >
              {t('prorab.plan.items.buttons.edit')}
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={() => handleDeleteItem(item.id)}
            >
              {t('prorab.plan.items.buttons.delete')}
            </Button>
          </div>
        )
      }

      return row
    }) || []

  return (
    <div className="prorab-plan-page">
      <div className="page-header">
        <div>
          <h2>
            {t('prorab.plan.title')} - {plan?.project_name} ({plan?.period_period})
          </h2>
          <div className="status-banner">
            {plan && getStatusBadge(plan.status)}
            {plan && !isEditable && plan.status !== 'draft' && (
              <p className="info">{t('prorab.plan.notEditable')}</p>
            )}
          </div>
        </div>
        <div className="actions">
          <Button onClick={() => navigate(-1)}>
            {t('prorab.plan.buttons.back')}
          </Button>
          {isEditable && plan && (
            <Button
              onClick={handleSubmit}
              disabled={!plan.items.length}
            >
              {t('prorab.plan.buttons.submit')}
            </Button>
          )}
        </div>
      </div>

      <div className="summary">
        <div className="summary-item">
          <span className="label">{t('prorab.plan.totalItems')}</span>
          <span className="value">{plan?.items.length || 0}</span>
        </div>
        <div className="summary-item">
          <span className="label">{t('prorab.plan.summary.plannedTotal')}</span>
          <span className="value">
            {plan?.total_amount 
              ? formatAmount(plan.total_amount)
              : '0.00 сом'}
          </span>
        </div>
        {summary && (
          <>
            <div className="summary-item">
              <span className="label">{t('prorab.plan.summary.spentTotal')}</span>
              <span className="value">
                {formatAmount(summary.spent_total)}
              </span>
            </div>
            <div className="summary-item">
              <span className="label">{t('prorab.plan.summary.remaining')}</span>
              <span className="value">
                {formatAmount(summary.remaining)}
              </span>
            </div>
          </>
        )}
        {plan?.limit_amount && (
          <div className="summary-item">
            <span className="label">{t('prorab.plan.limitAmount')}</span>
            <span className="value">
              {formatAmount(plan.limit_amount)}
            </span>
          </div>
        )}
      </div>

      {isEditable && plan && (
        <div className="create-section">
          <h3>{t('prorab.plan.createItem')}</h3>
          <CreateProrabPlanItemForm
            planId={plan.id}
            periodId={periodIdNum}
            onSuccess={() => {
              // refetch() not needed - RTK Query will auto-refetch due to tag invalidation
            }}
          />
        </div>
      )}

      <div className="plan-items-section">
        <h3>{t('prorab.plan.items.title')}</h3>
        {isLoading ? (
          <div className="loading">{t('prorab.plan.loading')}</div>
        ) : !plan?.items.length ? (
          <div className="empty-state">{t('prorab.plan.items.empty')}</div>
        ) : (
          <>
            {editingItemId && plan.items.find((item) => item.id === editingItemId) && (
              <EditProrabPlanItemForm
                key={editingItemId}
                planId={plan.id}
                periodId={periodIdNum}
                item={plan.items.find((item) => item.id === editingItemId)!}
                onSuccess={() => {
                  setEditingItemId(null)
                  // refetch() not needed - RTK Query will auto-refetch due to tag invalidation
                }}
                onCancel={() => setEditingItemId(null)}
              />
            )}
            <Table columns={columns} data={tableData} />
          </>
        )}
      </div>

      {plan && (
        <div className="expenses-section">
          <h3>{t('prorab.plan.expenses.title')}</h3>
          {!expenses || expenses.length === 0 ? (
            <div className="empty-state">{t('prorab.plan.expenses.empty')}</div>
          ) : (
            <Table
              columns={[
                { key: 'name', label: t('prorab.plan.expenses.columns.name') },
                { key: 'amount', label: t('prorab.plan.expenses.columns.amount') },
                { key: 'spent_at', label: t('prorab.plan.expenses.columns.spentAt') },
              ]}
              data={expenses.map((expense) => ({
                ...expense,
                amount: formatAmount(expense.amount),
                spent_at: new Date(expense.spent_at).toLocaleDateString('ru-RU'),
              }))}
            />
          )}
        </div>
      )}
    </div>
  )
}

export default ProrabPlanPage

