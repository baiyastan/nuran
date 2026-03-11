import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListFinancePeriodsQuery,
  useCreateFinancePeriodMutation,
} from '@/shared/api/financePeriodsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import {
  useGetIncomePlansSummaryQuery,
  useDeleteIncomePlanMutation,
  IncomePlan,
} from '@/shared/api/incomePlansApi'
import {
  useListIncomeEntriesQuery,
  useDeleteIncomeEntryMutation,
  IncomeEntry,
} from '@/shared/api/incomeEntriesApi'
import {
  useListTransfersQuery,
  useDeleteTransferMutation,
  type Transfer,
} from '@/shared/api/transfersApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { Button } from '@/shared/ui/Button/Button'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { IncomePlanModal } from '@/pages/finance-periods/IncomePlanModal'
import { IncomeEntryModal } from '@/pages/finance-periods/IncomeEntryModal'
import { TransferModal } from '@/features/transfer-modal/TransferModal'
import './FinancePage.css'

function FinancePage() {
  const { t } = useTranslation(['financePeriodDetails', 'financePeriods', 'common'])
  const { showSuccess, showError } = useToastContext()
  const { role } = useAuth()

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  )

  const { year, month } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-')
    return {
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
    }
  }, [selectedMonth])

  const { data: financePeriodsData } = useListFinancePeriodsQuery({
    year,
    month,
    fund_kind: 'office',
  })
  const { data: monthPeriod } = useGetMonthPeriodQuery(selectedMonth)
  const [createFinancePeriod, { isLoading: isCreatingFinancePeriod }] =
    useCreateFinancePeriodMutation()

  const officePeriod = useMemo(() => {
    if (!financePeriodsData) return undefined
    const results = Array.isArray(financePeriodsData)
      ? financePeriodsData
      : (financePeriodsData.results || [])
    return results[0]
  }, [financePeriodsData])

  const officePeriodId = officePeriod?.id
  const displayStatus = useMemo(() => {
    if (officePeriod?.status) return officePeriod.status
    if (monthPeriod?.status === 'OPEN') return 'open'
    if (monthPeriod?.status === 'LOCKED') return 'locked'
    return 'closed'
  }, [officePeriod?.status, monthPeriod?.status])

  const { data: incomePlansData, isLoading: isLoadingIncomePlans, error: incomePlansError } =
    useGetIncomePlansSummaryQuery(
      { year, month },
      { skip: year === 0 || month === 0 }
    )

  const {
    data: incomeEntriesData,
    isLoading: isLoadingEntries,
    error: entriesError,
  } = useListIncomeEntriesQuery(
    { finance_period: officePeriodId! },
    { skip: !officePeriodId }
  )

  const { data: transfersData, isLoading: isLoadingTransfers, error: transfersError } =
    useListTransfersQuery({ month: selectedMonth })

  const [deleteIncomePlan, { isLoading: isDeletingPlan }] = useDeleteIncomePlanMutation()
  const [deleteIncomeEntry, { isLoading: isDeletingEntry }] = useDeleteIncomeEntryMutation()
  const [deleteTransfer, { isLoading: isDeletingTransfer }] = useDeleteTransferMutation()

  const [showPlanModal, setShowPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<IncomePlan | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null)
  const [showEntryModal, setShowEntryModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null)
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null)
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<Transfer | null>(null)
  const [deletingTransferId, setDeletingTransferId] = useState<number | null>(null)

  const isPeriodOpen = displayStatus === 'open'
  const isPeriodLocked = displayStatus === 'locked'
  const canManagePlans = role === 'admin' && isPeriodOpen
  const canManageEntries =
    (role === 'admin' || role === 'director') && (isPeriodOpen || isPeriodLocked)

  const canCreateOfficePeriod =
    role === 'admin' &&
    monthPeriod?.status === 'OPEN' &&
    !officePeriod

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    const statusKey = (status || '').toUpperCase()
    const validStatusKeys = ['OPEN', 'LOCKED', 'CLOSED']
    const label = validStatusKeys.includes(statusKey)
      ? t(`status.${statusKey}`, { ns: 'common' })
      : statusKey
    const badgeClass =
      statusLower === 'open'
        ? 'finance-page-badge finance-page-badge--open'
        : statusLower === 'locked'
          ? 'finance-page-badge finance-page-badge--locked'
          : 'finance-page-badge finance-page-badge--closed'
    return <span className={badgeClass}>{label}</span>
  }

  const handleCreateOfficePeriod = async () => {
    if (!monthPeriod) {
      showError(t('createOfficePeriod.noMonth', { ns: 'financePeriods' }))
      return
    }
    try {
      await createFinancePeriod({
        month_period: monthPeriod.id,
        fund_kind: 'office',
      }).unwrap()
      showSuccess(t('createOfficePeriod.success', { ns: 'financePeriods' }))
    } catch (err: unknown) {
      showError(
        getErrorMessage(err) || t('createOfficePeriod.error', { ns: 'financePeriods' })
      )
    }
  }

  const handleAddPlan = () => {
    setEditingPlan(null)
    setShowPlanModal(true)
  }
  const handleEditPlan = (plan: IncomePlan) => {
    setEditingPlan(plan)
    setShowPlanModal(true)
  }
  const handleDeletePlan = async (planId: number) => {
    if (!window.confirm(t('financePeriodDetails.confirm.deletePlan'))) return
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
    showSuccess(
      editingPlan
        ? t('financePeriodDetails.toast.planUpdated')
        : t('financePeriodDetails.toast.planCreated')
    )
  }
  const handlePlanModalClose = () => {
    setShowPlanModal(false)
    setEditingPlan(null)
  }

  const handleAddEntry = () => {
    setEditingEntry(null)
    setShowEntryModal(true)
  }
  const handleEditEntry = (entry: IncomeEntry) => {
    setEditingEntry(entry)
    setShowEntryModal(true)
  }
  const handleDeleteEntry = async (entryId: number) => {
    if (!window.confirm(t('financePeriodDetails.confirm.deleteEntry'))) return
    if (!officePeriodId) return
    setDeletingEntryId(entryId)
    try {
      await deleteIncomeEntry({ id: entryId, finance_period: officePeriodId }).unwrap()
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
    showSuccess(
      editingEntry
        ? t('financePeriodDetails.toast.entryUpdated')
        : t('financePeriodDetails.toast.entryCreated')
    )
  }
  const handleEntryModalClose = () => {
    setShowEntryModal(false)
    setEditingEntry(null)
  }

  const handleAddTransfer = () => {
    setEditingTransfer(null)
    setShowTransferModal(true)
  }
  const handleEditTransfer = (tr: Transfer) => {
    setEditingTransfer(tr)
    setShowTransferModal(true)
  }
  const handleDeleteTransfer = async (transferId: number) => {
    if (!window.confirm(t('financePeriodDetails.confirm.deleteTransfer'))) return
    setDeletingTransferId(transferId)
    try {
      await deleteTransfer(transferId).unwrap()
      showSuccess(t('financePeriodDetails.toast.transferDeleted'))
    } catch (err: unknown) {
      showError(getErrorMessage(err) || t('financePeriodDetails.toast.transferDeleteError'))
    } finally {
      setDeletingTransferId(null)
    }
  }
  const handleTransferModalSuccess = () => {
    setShowTransferModal(false)
    setEditingTransfer(null)
    showSuccess(
      editingTransfer
        ? t('financePeriodDetails.toast.transferUpdated')
        : t('financePeriodDetails.toast.transferCreated')
    )
  }
  const handleTransferModalClose = () => {
    setShowTransferModal(false)
    setEditingTransfer(null)
  }

  const planColumns = [
    { key: 'source', label: t('income.common.source', { ns: 'financePeriods' }) },
    { key: 'amount', label: t('financePeriodDetails.plans.amountColumn') },
    ...(canManagePlans ? [{ key: 'actions', label: t('actions', { ns: 'common' }) }] : []),
  ]
  const planTableData =
    incomePlansData?.results.map((plan) => ({
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
              {deletingPlanId === plan.id
                ? t('financePeriodDetails.actions.deleting')
                : t('financePeriodDetails.actions.delete')}
            </Button>
          </div>
        ),
      }),
    })) || []

  const entryColumns = [
    { key: 'date', label: t('income.common.date', { ns: 'financePeriods' }) },
    { key: 'source', label: t('income.common.source', { ns: 'financePeriods' }) },
    { key: 'amount', label: t('income.common.amount', { ns: 'financePeriods' }) },
    { key: 'comment', label: t('income.common.comment', { ns: 'financePeriods' }) },
    ...(canManageEntries ? [{ key: 'actions', label: t('actions', { ns: 'common' }) }] : []),
  ]
  const entryTableData =
    incomeEntriesData?.results.map((entry) => ({
      id: entry.id,
      date: formatDate(entry.received_at),
      source: entry.source?.name || '-',
      amount: formatMoneyKGS(entry.amount),
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
              {deletingEntryId === entry.id
                ? t('financePeriodDetails.actions.deleting')
                : t('financePeriodDetails.actions.delete')}
            </Button>
          </div>
        ),
      }),
    })) || []

  const renderCell = (column: string, value: unknown, _row: Record<string, unknown>) => {
    if (column === 'actions' && React.isValidElement(value)) return value
    return value as React.ReactNode
  }

  const transferColumns = [
    { key: 'date', label: t('income.common.date', { ns: 'financePeriods' }) },
    { key: 'from', label: t('financePeriodDetails.transfers.from') },
    { key: 'to', label: t('financePeriodDetails.transfers.to') },
    { key: 'amount', label: t('income.common.amount', { ns: 'financePeriods' }) },
    { key: 'comment', label: t('income.common.comment', { ns: 'financePeriods' }) },
    ...(canManageEntries ? [{ key: 'actions', label: t('actions', { ns: 'common' }) }] : []),
  ]
  const transferTableData =
    transfersData?.results.map((tr) => ({
      id: tr.id,
      date: formatDate(tr.transferred_at),
      from: tr.source_account === 'CASH' ? t('income.common.accountCash', { ns: 'financePeriods' }) : t('income.common.accountBank', { ns: 'financePeriods' }),
      to: tr.destination_account === 'CASH' ? t('income.common.accountCash', { ns: 'financePeriods' }) : t('income.common.accountBank', { ns: 'financePeriods' }),
      amount: formatMoneyKGS(tr.amount),
      comment: tr.comment || '-',
      ...(canManageEntries && {
        actions: (
          <div className="table-actions">
            <Button
              size="small"
              variant="secondary"
              onClick={() => handleEditTransfer(tr)}
              disabled={isDeletingTransfer}
            >
              {t('financePeriodDetails.actions.edit')}
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={() => handleDeleteTransfer(tr.id)}
              disabled={isDeletingTransfer || deletingTransferId === tr.id}
            >
              {deletingTransferId === tr.id
                ? t('financePeriodDetails.actions.deleting')
                : t('financePeriodDetails.actions.delete')}
            </Button>
          </div>
        ),
      }),
    })) || []

  return (
    <div className="finance-page">
      <div className="finance-page-header">
        <h1>{t('title', { ns: 'financePeriods' })}</h1>
        <div className="finance-page-controls">
          <div className="month-selector">
            <label htmlFor="finance-month-select" className="month-selector__label">
              {t('month', { ns: 'financePeriods' })}
            </label>
            <input
              id="finance-month-select"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="month-selector__input"
            />
          </div>
          <div className="finance-page-status">
            {getStatusBadge(displayStatus)}
          </div>
        </div>
      </div>

      {!isPeriodOpen && (
        <div className="period-locked-message">
          {t('financePeriodDetails.plans.disabled')}
        </div>
      )}

      {/* Section 1: Income Plans */}
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
          <TableSkeleton columnCount={3} />
        ) : incomePlansError ? (
          <div className="finance-page-error">
            {t('financePeriodDetails.error.plans')}
          </div>
        ) : !incomePlansData?.results.length ? (
          <div className="finance-page-empty">
            {t('financePeriodDetails.plans.empty')}
          </div>
        ) : (
          <Table
            columns={planColumns}
            data={planTableData}
            renderCell={renderCell}
          />
        )}
      </div>

      {/* Section 2: Income Entries */}
      <div className="details-table">
        <div className="table-header">
          <h3>{t('financePeriodDetails.entries.title')}</h3>
          {officePeriodId && canManageEntries && (
            <Button onClick={handleAddEntry}>
              {t('incomeEntry.addButton', { ns: 'financePeriods' })}
            </Button>
          )}
        </div>
        {!officePeriodId ? (
          <div className="finance-page-empty finance-page-entries-empty">
            <p>{t('empty.title', { ns: 'financePeriods' })}</p>
            {canCreateOfficePeriod && (
              <div className="finance-periods-empty-actions">
                <Button
                  onClick={handleCreateOfficePeriod}
                  disabled={isCreatingFinancePeriod}
                >
                  {isCreatingFinancePeriod
                    ? t('createOfficePeriod.creating', { ns: 'financePeriods' })
                    : t('createOfficePeriod.button', { ns: 'financePeriods' })}
                </Button>
              </div>
            )}
            {role === 'admin' && monthPeriod?.status !== 'OPEN' && (
              <p className="finance-periods-hint">
                {t('createOfficePeriod.needOpen', { ns: 'financePeriods' })}
              </p>
            )}
          </div>
        ) : isLoadingEntries ? (
          <TableSkeleton columnCount={5} />
        ) : entriesError ? (
          <div className="finance-page-error">
            {t('financePeriodDetails.error.entries')}
          </div>
        ) : !incomeEntriesData?.results.length ? (
          <div className="finance-page-empty">
            {t('financePeriodDetails.entries.empty')}
          </div>
        ) : (
          <Table
            columns={entryColumns}
            data={entryTableData}
            renderCell={renderCell}
          />
        )}
      </div>

      {/* Section 3: Internal Transfers (Cash ↔ Bank) */}
      <div className="details-table transfers-section">
        <div className="table-header">
          <h3>{t('financePeriodDetails.transfers.title')}</h3>
          {canManageEntries && (
            <Button onClick={handleAddTransfer}>
              {t('financePeriodDetails.transfers.addButton')}
            </Button>
          )}
        </div>
        {isLoadingTransfers ? (
          <TableSkeleton columnCount={5} />
        ) : transfersError ? (
          <div className="finance-page-error">
            {t('financePeriodDetails.error.transfers')}
          </div>
        ) : !transfersData?.results.length ? (
          <div className="finance-page-empty">
            {t('financePeriodDetails.transfers.empty')}
          </div>
        ) : (
          <Table
            columns={transferColumns}
            data={transferTableData}
            renderCell={renderCell}
          />
        )}
      </div>

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

      {showEntryModal && officePeriodId !== undefined && (
        <IncomeEntryModal
          isOpen={showEntryModal}
          onClose={handleEntryModalClose}
          onSuccess={handleEntryModalSuccess}
          entry={editingEntry}
          financePeriodId={officePeriodId}
        />
      )}

      {showTransferModal && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={handleTransferModalClose}
          onSuccess={handleTransferModalSuccess}
          transfer={editingTransfer}
        />
      )}
    </div>
  )
}

export default FinancePage
