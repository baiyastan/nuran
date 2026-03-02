import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListActualExpensesQuery,
  useDeleteActualExpenseMutation,
} from '@/shared/api/actualExpensesApi'
import { ActualExpense } from '@/entities/actual-expense/model'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { toast } from '@/shared/ui/Toast/toast'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { CreateActualExpenseModal } from '@/features/actual-expense-create/CreateActualExpenseModal'
import { EditActualExpenseModal } from '@/features/actual-expense-edit/EditActualExpenseModal'
import { FinancePeriod } from '@/entities/finance-period/model'
import './ExpensesList.css'

interface ExpensesListProps {
  financePeriodId: number
  financePeriod: FinancePeriod
  isMonthOpen?: boolean
  canManage?: boolean
}

function fundKindToScopeUI(fundKind: FinancePeriod['fund_kind']): 'OFFICE' | 'PROJECT' | 'CHARITY' {
  if (fundKind === 'office') return 'OFFICE'
  if (fundKind === 'charity') return 'CHARITY'
  return 'PROJECT'
}

export function ExpensesList({ financePeriodId: _financePeriodId, financePeriod, isMonthOpen = true, canManage: canManageProp = false }: ExpensesListProps) {
  const { t } = useTranslation()
  const { role } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ActualExpense | null>(null)
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null)

  const { data, isLoading, error } = useListActualExpensesQuery({
    month: financePeriod.month_period_month,
    scope: fundKindToScopeUI(financePeriod.fund_kind),
  })
  const [deleteExpense, { isLoading: isDeleting }] = useDeleteActualExpenseMutation()

  const canManage = role === 'admin' && canManageProp && isMonthOpen

  const handleEdit = (e: React.MouseEvent, expense: ActualExpense) => {
    e.stopPropagation()
    setEditingExpense(expense)
  }

  const handleDeleteClick = (e: React.MouseEvent, expenseId: number) => {
    e.stopPropagation()
    setDeletingExpenseId(expenseId)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingExpenseId) return

    try {
      await deleteExpense(deletingExpenseId).unwrap()
      setDeletingExpenseId(null)
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      toast.error(errorMessage || t('expenses.loadError'))
    }
  }

  const handleDeleteCancel = () => {
    setDeletingExpenseId(null)
  }

  const columns = [
    { key: 'spent_at', label: t('expenses.columns.spentAt') },
    { key: 'category_name', label: t('expenses.columns.category') },
    { key: 'name', label: t('expenses.columns.name') },
    { key: 'amount', label: t('expenses.columns.amount') },
    { key: 'comment', label: t('expenses.columns.comment') },
    { key: 'created_by_username', label: t('expenses.columns.createdBy') },
    { key: 'created_at', label: t('expenses.columns.createdAt') },
    ...(canManage ? [{ key: 'actions', label: t('expenses.columns.actions') }] : []),
  ]

  // Handle both [] and {results: []} response shapes
  const expenses = useMemo(() => {
    if (!data) return []
    return Array.isArray(data) ? data : data.results || []
  }, [data])

  // Calculate total amount
  const totalAmount = useMemo(() => {
    return expenses.reduce((sum, expense) => {
      const amount = parseFloat(expense.amount || '0')
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
  }, [expenses])

  const tableData = useMemo(() => {
    return expenses.map((expense) => ({
      ...expense,
      spent_at: formatDate(expense.spent_at),
      category_name: expense.category_name || '-',
      amount: formatMoneyKGS(expense.amount || '0'),
      comment: expense.comment || '-',
      created_by_username: expense.created_by_username || '-',
      created_at: formatDate(expense.created_at),
      actions: canManage ? (
        <div style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={(e) => handleEdit(e, expense)}>
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={(e) => handleDeleteClick(e, expense.id)}
            disabled={isDeleting}
          >
            {t('common.delete')}
          </Button>
        </div>
      ) : null,
    }))
  }, [expenses, canManage, isDeleting, t])

  return (
    <div className="expenses-list">
      <div className="list-header">
        {canManage && (
          <Button onClick={() => setShowCreateModal(true)}>
            {t('expenses.create')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="loading">{t('common.loading')}</div>
      ) : error ? (
        <div className="error">{t('expenses.loadError')}</div>
      ) : expenses.length === 0 ? (
        <div className="empty-state">
          <p>{t('expenses.empty.title')}</p>
          {canManage && (
            <Button onClick={() => setShowCreateModal(true)}>
              {t('expenses.empty.cta')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <Table columns={columns} data={tableData} />
          {expenses.length > 0 && (
            <div className="expenses-totals" style={{
              marginTop: '1rem',
              padding: '1rem',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'flex-end',
              fontWeight: 'bold',
              fontSize: '1.1em',
            }}>
              <span>{t('expenses.total')} {formatMoneyKGS(totalAmount)}</span>
            </div>
          )}
        </>
      )}

      {canManage && (
        <>
          <CreateActualExpenseModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            month={financePeriod.month_period_month}
            scope={fundKindToScopeUI(financePeriod.fund_kind)}
          />
          <EditActualExpenseModal
            isOpen={!!editingExpense}
            onClose={() => setEditingExpense(null)}
            expense={editingExpense}
            month={financePeriod.month_period_month}
            scope={fundKindToScopeUI(financePeriod.fund_kind)}
          />
          <Modal
            isOpen={!!deletingExpenseId}
            onClose={handleDeleteCancel}
            title={t('expenses.delete.title')}
            closeOnBackdropClick={false}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>{t('expenses.delete.message')}</p>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                >
                  {isDeleting ? t('common.deleting') : t('common.delete')}
                </Button>
              </div>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}


