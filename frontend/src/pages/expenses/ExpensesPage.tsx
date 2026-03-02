import { useState, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  useListActualExpensesQuery,
  useDeleteActualExpenseMutation,
  ActualExpense,
} from '@/shared/api/actualExpensesApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { CreateActualExpenseModal } from '@/features/actual-expense-create/CreateActualExpenseModal'
import { EditActualExpenseModal } from '@/features/actual-expense-edit/EditActualExpenseModal'
import { MonthGateBanner } from '@/features/month-gate/MonthGateBanner'
import { formatDate } from '@/shared/lib/utils'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import './ExpensesPage.css'

type ScopeUI = 'OFFICE' | 'PROJECT' | 'CHARITY'

const DEFAULT_MONTH = () => new Date().toISOString().slice(0, 7)
const DEFAULT_SCOPE: ScopeUI = 'OFFICE'

function ExpensesPage() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const month = searchParams.get('month') || DEFAULT_MONTH()
  const scope = (searchParams.get('scope') as ScopeUI) || DEFAULT_SCOPE

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ActualExpense | null>(null)
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null)

  const canManageExpenses = role === 'admin' || role === 'director'

  useEffect(() => {
    if (!searchParams.has('month') || !searchParams.has('scope')) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!prev.has('month')) next.set('month', month)
          if (!prev.has('scope')) next.set('scope', scope)
          return next
        },
        { replace: true }
      )
    }
  }, [month, scope, searchParams, setSearchParams])

  const { data: expensesData, isLoading: isLoadingExpenses } = useListActualExpensesQuery(
    { month, scope },
    { skip: !month || !scope }
  )

  const expenses = useMemo(() => expensesData?.results ?? [], [expensesData])

  const [deleteExpense, { isLoading: isDeleting }] = useDeleteActualExpenseMutation()

  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, exp) => sum + Number(exp.amount), 0)
  }, [expenses])

  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value || DEFAULT_MONTH()
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('month', value)
        next.set('scope', scope)
        return next
      },
      { replace: true }
    )
  }

  const handleScopeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = (e.target.value as ScopeUI) || DEFAULT_SCOPE
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('month', month)
        next.set('scope', value)
        return next
      },
      { replace: true }
    )
  }

  const handleEditSuccess = () => {
    setEditingExpense(null)
  }

  const handleDeleteClick = useCallback((expenseId: number) => {
    if (window.confirm(t('expensesPage.delete.confirm'))) {
      setDeletingExpenseId(expenseId)
      deleteExpense(expenseId)
        .unwrap()
        .then(() => setDeletingExpenseId(null))
        .catch(() => setDeletingExpenseId(null))
    }
  }, [t, deleteExpense])

  const tableColumns = [
    { key: 'spent_at', label: t('expensesPage.table.columns.spentAt') },
    { key: 'category_name', label: t('expensesPage.table.columns.category') || 'Category' },
    { key: 'amount', label: t('expensesPage.table.columns.amount') },
    { key: 'comment', label: t('expensesPage.table.columns.comment') },
    ...(canManageExpenses ? [{ key: 'actions', label: '' }] : []),
  ]

  const tableData = useMemo(() => {
    return expenses.map((expense) => ({
      ...expense,
      spent_at: formatDate(expense.spent_at),
      amount: formatMoneyKGS(expense.amount),
      category_name: expense.category_name ?? '-',
      comment: expense.comment || '-',
      actions: canManageExpenses ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button size="small" onClick={() => setEditingExpense(expense)}>
            {t('expensesPage.table.actions.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => handleDeleteClick(expense.id)}
            disabled={isDeleting && deletingExpenseId === expense.id}
          >
            {t('expensesPage.table.actions.delete')}
          </Button>
        </div>
      ) : null,
    }))
  }, [expenses, canManageExpenses, isDeleting, deletingExpenseId, t, handleDeleteClick])

  const scopeLabel =
    scope === 'PROJECT'
      ? t('fundKind.project', { ns: 'financePeriods' })
      : scope === 'CHARITY'
        ? t('fundKind.charity', { ns: 'financePeriods' })
        : t('fundKind.office', { ns: 'financePeriods' })

  return (
    <div className="expenses-page">
      <div className="page-header">
        <h2>{t('expensesPage.title')}</h2>
      </div>

      <MonthGateBanner />

      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="month-filter" className="filter-label">
            {t('expensesPage.filters.month')}
          </label>
          <input
            id="month-filter"
            type="month"
            value={month}
            onChange={handleMonthChange}
            className="filter-input"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="fund-kind-filter" className="filter-label">
            {t('expensesPage.filters.fundKind')}
          </label>
          <select
            id="fund-kind-filter"
            value={scope}
            onChange={handleScopeChange}
            className="filter-select"
          >
            <option value="OFFICE">{t('fundKind.office', { ns: 'financePeriods' })}</option>
            <option value="PROJECT">{t('fundKind.project', { ns: 'financePeriods' })}</option>
            <option value="CHARITY">{t('fundKind.charity', { ns: 'financePeriods' })}</option>
          </select>
        </div>
      </div>

      <div className="expenses-content">
        <div className="expenses-header">
          <div className="selected-plan-info">
            <p>{scopeLabel} · {month}</p>
          </div>
          {canManageExpenses && (
            <Button onClick={() => setShowCreateModal(true)}>{t('expensesPage.addExpense')}</Button>
          )}
        </div>

        {isLoadingExpenses ? (
          <div className="loading">{t('expensesPage.loading')}</div>
        ) : expenses.length === 0 ? (
          <div className="empty-state">
            <p>{t('expensesPage.empty.noExpenses')}</p>
          </div>
        ) : (
          <>
            <Table columns={tableColumns} data={tableData} />
            <div className="expenses-total">
              <strong>
                {t('expensesPage.total.label')}: {formatMoneyKGS(totalAmount)}
              </strong>
            </div>
          </>
        )}
      </div>

      {showCreateModal && (
        <CreateActualExpenseModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          month={month}
          scope={scope}
        />
      )}

      {editingExpense && (
        <EditActualExpenseModal
          expense={editingExpense}
          month={month}
          scope={scope}
          onClose={() => setEditingExpense(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  )
}

export default ExpensesPage
