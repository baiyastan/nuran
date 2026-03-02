import React, { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetFinancePeriodQuery } from '@/shared/api/financePeriodsApi'
import { useGetIncomePlansSummaryQuery, useDeleteIncomePlanMutation, IncomePlan } from '@/shared/api/incomePlansApi'
import { useListIncomeEntriesQuery, useDeleteIncomeEntryMutation, IncomeEntry } from '@/shared/api/incomeEntriesApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { Button } from '@/shared/ui/Button/Button'
import { Table } from '@/shared/ui/Table/Table'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { IncomePlanModal } from './IncomePlanModal'
import { IncomeEntryModal } from './IncomeEntryModal'
import { IncomeSummaryTable } from './IncomeSummaryTable'
import './FinancePeriodDetailsPage.css'

function FinancePeriodDetailsPage() {
  const { t } = useTranslation(['financePeriodDetails', 'financePeriods', 'common'])
  const navigate = useNavigate()
  const { showSuccess, showError } = useToastContext()
  const { role } = useAuth()
  const { id } = useParams<{ id: string }>()
  const financePeriodId = id ? parseInt(id, 10) : 0

  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<IncomePlan | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null)

  const [showEntryModal, setShowEntryModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null)
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null)

  const { data: financePeriod, isLoading: isLoadingPeriod, error: periodError } = useGetFinancePeriodQuery(financePeriodId)

  // Extract year and month from month_period_month (YYYY-MM format)
  const { year, month } = useMemo(() => {
    if (!financePeriod?.month_period_month) {
      return { year: 0, month: 0 }
    }
    const [yearStr, monthStr] = financePeriod.month_period_month.split('-')
    return {
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
    }
  }, [financePeriod?.month_period_month])

  // Fetch income plans summary, skip until financePeriod exists
  const { data: incomePlansData, isLoading: isLoadingIncomePlans, error: incomePlansError } = useGetIncomePlansSummaryQuery(
    { year, month },
    { skip: !financePeriod || year === 0 || month === 0 }
  )

  // Fetch income entries, skip until financePeriod exists
  const { data: incomeEntriesData, isLoading: isLoadingEntries, error: entriesError } = useListIncomeEntriesQuery(
    { finance_period: financePeriodId },
    { skip: !financePeriod || financePeriodId === 0 }
  )

  const [deleteIncomePlan, { isLoading: isDeletingPlan }] = useDeleteIncomePlanMutation()
  const [deleteIncomeEntry, { isLoading: isDeletingEntry }] = useDeleteIncomeEntryMutation()

  // Check period status
  const isPeriodOpen = financePeriod?.status === 'open'
  const isPeriodLocked = financePeriod?.status === 'locked'
  const canManagePlans = role === 'admin' && isPeriodOpen
  const canManageEntries =
    (role === 'admin' || role === 'director') && (isPeriodOpen || isPeriodLocked)

  // Calculate actual income total (sum of entry amounts)
  const actualIncomeTotal = useMemo(() => {
    if (!incomeEntriesData?.results) return '0'
    const total = incomeEntriesData.results.reduce((sum, entry) => {
      return sum + parseFloat(entry.amount || '0')
    }, 0)
    return total.toString()
  }, [incomeEntriesData?.results])

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    const statusKey = (status || '').toUpperCase()
    const validStatusKeys = ['OPEN', 'LOCKED', 'CLOSED']
    const label = validStatusKeys.includes(statusKey)
      ? t(`status.${statusKey}`, { ns: 'common' })
      : statusKey
    const badgeClass = statusLower === 'open' 
      ? 'details-badge details-badge--open'
      : statusLower === 'locked'
      ? 'details-badge details-badge--locked'
      : 'details-badge details-badge--closed'
    return (
      <span className={badgeClass}>
        {label}
      </span>
    )
  }

  // Income Plans handlers
  const handleAddPlan = () => {
    setEditingPlan(null)
    setShowPlanModal(true)
  }

  const handleEditPlan = (plan: IncomePlan) => {
    setEditingPlan(plan)
    setShowPlanModal(true)
  }

  const handleDeletePlan = async (planId: number) => {
    if (!window.confirm(t('financePeriodDetails.confirm.deletePlan'))) {
      return
    }

    setDeletingPlanId(planId)
    try {
      await deleteIncomePlan({ id: planId, year, month }).unwrap()
      showSuccess(t('financePeriodDetails.toast.planDeleted'))
    } catch (err: unknown) {
      showError(getErrorMessage(err) || t('financePeriodDetails.toast.planDeleteError'))
    } finally {
      setDeletingPlanId(null)
    }
  }

  const handlePlanModalSuccess = () => {
    setShowPlanModal(false)
    setEditingPlan(null)
    showSuccess(editingPlan ? t('financePeriodDetails.toast.planUpdated') : t('financePeriodDetails.toast.planCreated'))
  }

  const handlePlanModalClose = () => {
    setShowPlanModal(false)
    setEditingPlan(null)
  }

  // Income Entries handlers
  const handleAddEntry = () => {
    setEditingEntry(null)
    setShowEntryModal(true)
  }

  const handleEditEntry = (entry: IncomeEntry) => {
    setEditingEntry(entry)
    setShowEntryModal(true)
  }

  const handleDeleteEntry = async (entryId: number) => {
    if (!window.confirm(t('financePeriodDetails.confirm.deleteEntry'))) {
      return
    }

    setDeletingEntryId(entryId)
    try {
      await deleteIncomeEntry({ id: entryId, finance_period: financePeriodId }).unwrap()
      showSuccess(t('financePeriodDetails.toast.entryDeleted'))
    } catch (err: unknown) {
      showError(getErrorMessage(err) || t('financePeriodDetails.toast.entryDeleteError'))
    } finally {
      setDeletingEntryId(null)
    }
  }

  const handleEntryModalSuccess = () => {
    setShowEntryModal(false)
    setEditingEntry(null)
    showSuccess(editingEntry ? t('financePeriodDetails.toast.entryUpdated') : t('financePeriodDetails.toast.entryCreated'))
  }

  const handleEntryModalClose = () => {
    setShowEntryModal(false)
    setEditingEntry(null)
  }

  // Loading state
  if (isLoadingPeriod) {
    return (
      <div className="finance-period-details">
        <div className="loading">{t('financePeriodDetails.loading')}</div>
      </div>
    )
  }

  // Error state
  if (periodError || !financePeriod) {
    return (
      <div className="finance-period-details">
        <div className="error">{t('financePeriodDetails.error.period')}</div>
      </div>
    )
  }

  // Income Plans Table columns (conditionally include Actions for admin)
  const planColumns = [
    { key: 'source', label: t('income.common.source', { ns: 'financePeriods' }) },
    { key: 'amount', label: t('income.common.amount', { ns: 'financePeriods' }) },
    ...(canManagePlans ? [{ key: 'actions', label: t('actions', { ns: 'common' }) }] : []),
  ]

  // Income Plans Table data
  const planTableData = incomePlansData?.results.map((plan) => ({
    id: plan.id,
    source: plan.source.name,
    amount: formatMoneyKGS(plan.amount),
    ...(canManagePlans && {
      actions: (
        <div className="income-plans-actions">
          <Button
            size="small"
            variant="secondary"
            onClick={() => handleEditPlan(plan)}
            disabled={isDeletingPlan}
          >
            {t('financePeriodDetails.actions.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => handleDeletePlan(plan.id)}
            disabled={isDeletingPlan || deletingPlanId === plan.id}
          >
            {deletingPlanId === plan.id ? t('financePeriodDetails.actions.deleting') : t('financePeriodDetails.actions.delete')}
          </Button>
        </div>
      ),
    }),
  })) || []

  // Income Entries Table columns
  const entryColumns = [
    { key: 'source', label: t('income.common.source', { ns: 'financePeriods' }) },
    { key: 'amount', label: t('income.common.amount', { ns: 'financePeriods' }) },
    { key: 'date', label: t('income.common.date', { ns: 'financePeriods' }) },
    { key: 'comment', label: t('income.common.comment', { ns: 'financePeriods' }) },
    ...(canManageEntries ? [{ key: 'actions', label: t('actions', { ns: 'common' }) }] : []),
  ]

  // Income Entries Table data
  const entryTableData = incomeEntriesData?.results.map((entry) => ({
    id: entry.id,
    source: entry.source?.name || '-',
    amount: formatMoneyKGS(entry.amount),
    date: formatDate(entry.received_at),
    comment: entry.comment || '-',
    ...(canManageEntries && {
      actions: (
        <div className="table-actions">
          <Button
            size="small"
            variant="secondary"
            onClick={() => handleEditEntry(entry)}
            disabled={isDeletingEntry}
          >
            {t('financePeriodDetails.actions.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => handleDeleteEntry(entry.id)}
            disabled={isDeletingEntry || deletingEntryId === entry.id}
          >
            {deletingEntryId === entry.id ? t('financePeriodDetails.actions.deleting') : t('financePeriodDetails.actions.delete')}
          </Button>
        </div>
      ),
    }),
  })) || []

  // Use renderCell to properly render actions
  const renderCell = (column: string, value: unknown, _row: Record<string, unknown>) => {
    if (column === 'actions' && React.isValidElement(value)) {
      return value
    }
    return value as React.ReactNode
  }

  return (
    <div className="finance-period-details">
      {/* Header Section */}
      <div className="details-header">
        <div className="details-header__content">
          <Button onClick={() => navigate(-1)}>
            {t('common.back')}
          </Button>
          <div className="details-header__info">
            <div className="details-header__month">{financePeriod.month_period_month}</div>
            <div className="details-header__fund-kind">
              {t(`fundKind.${financePeriod.fund_kind}`, { ns: 'financePeriods' }) || financePeriod.fund_kind}
            </div>
            <div className="details-header__status">
              {getStatusBadge(financePeriod.status)}
            </div>
          </div>
        </div>
      </div>

      {/* Period Not Open Message */}
      {!isPeriodOpen && (
        <div className="period-locked-message">
          {t('financePeriodDetails.plans.disabled')}
        </div>
      )}

      {/* Summary Section */}
      <div className="details-summary">
        <div className="summary-card">
          <div className="summary-card__label">{t('financePeriodDetails.summary.plannedTotal')}</div>
          <div className="summary-card__value">
            {formatMoneyKGS(incomePlansData?.summary.total_amount || '0')}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card__label">{t('financePeriodDetails.summary.itemsCount')}</div>
          <div className="summary-card__value">
            {incomePlansData?.summary.items_count || 0}
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-card__label">{t('financePeriodDetails.summary.actualTotal')}</div>
          <div className="summary-card__value">
            {formatMoneyKGS(actualIncomeTotal)}
          </div>
        </div>
      </div>

      {/* Income Summary Table */}
      <IncomeSummaryTable financePeriodId={financePeriodId} />

      {/* Income Plans Section */}
      <div className="income-plans-section">
        <div className="income-plans-header">
          <h3>{t('financePeriodDetails.plans.title')}</h3>
          {canManagePlans && (
            <Button onClick={handleAddPlan}>
              {t('incomePlan.addButton', { ns: 'financePeriods' })}
            </Button>
          )}
        </div>
        {!isPeriodOpen && (
          <div className="income-plans-disabled">
            {t('financePeriodDetails.plans.disabled')}
          </div>
        )}
        {isLoadingIncomePlans ? (
          <div className="loading">{t('financePeriodDetails.loading')}</div>
        ) : incomePlansError ? (
          <div className="error">{t('financePeriodDetails.error.plans')}</div>
        ) : !incomePlansData?.results.length ? (
          <div className="empty">{t('financePeriodDetails.plans.empty')}</div>
        ) : (
          <Table columns={planColumns} data={planTableData} renderCell={renderCell} />
        )}
      </div>

      {/* Income Entries Table */}
      <div className="details-table">
        <div className="table-header">
          <h3>{t('financePeriodDetails.entries.title')}</h3>
          {canManageEntries && (
            <Button onClick={handleAddEntry}>
              {t('incomeEntry.addButton', { ns: 'financePeriods' })}
            </Button>
          )}
        </div>
        {isLoadingEntries ? (
          <div className="loading">{t('financePeriodDetails.loading')}</div>
        ) : entriesError ? (
          <div className="error">{t('financePeriodDetails.error.entries')}</div>
        ) : !incomeEntriesData?.results.length ? (
          <div className="empty">{t('financePeriodDetails.entries.empty')}</div>
        ) : (
          <Table columns={entryColumns} data={entryTableData} renderCell={renderCell} />
        )}
      </div>

      {/* Income Plan Modal */}
      {showPlanModal && (
        <IncomePlanModal
          isOpen={showPlanModal}
          onClose={handlePlanModalClose}
          onSuccess={handlePlanModalSuccess}
          plan={editingPlan}
          year={year}
          month={month}
        />
      )}

      {/* Income Entry Modal */}
      {showEntryModal && (
        <IncomeEntryModal
          isOpen={showEntryModal}
          onClose={handleEntryModalClose}
          onSuccess={handleEntryModalSuccess}
          entry={editingEntry}
          financePeriodId={financePeriodId}
        />
      )}
    </div>
  )
}

export default FinancePeriodDetailsPage
