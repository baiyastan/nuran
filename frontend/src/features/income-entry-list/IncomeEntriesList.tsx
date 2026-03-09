import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListIncomeEntriesQuery,
  IncomeEntry,
  useDeleteIncomeEntryMutation,
} from '@/shared/api/incomeEntriesApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { Modal } from '@/shared/ui/Modal/Modal'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { toast } from '@/shared/ui/Toast/toast'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { CreateIncomeEntryModal } from '@/features/income-entry-create/CreateIncomeEntryModal'
import { EditIncomeEntryModal } from '@/features/income-entry-edit/EditIncomeEntryModal'
import './IncomeEntriesList.css'

interface IncomeEntriesListProps {
  financePeriodId: number
  isMonthOpen?: boolean
  canManage?: boolean
}

export function IncomeEntriesList({ financePeriodId, isMonthOpen = true, canManage: canManageProp = false }: IncomeEntriesListProps) {
  const { t } = useTranslation()
  const { role } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingIncomeEntry, setEditingIncomeEntry] = useState<IncomeEntry | null>(null)
  const [deletingIncomeEntryId, setDeletingIncomeEntryId] = useState<number | null>(null)

  const { data, isLoading, error } = useListIncomeEntriesQuery({
    finance_period: financePeriodId,
  })
  const [deleteIncomeEntry, { isLoading: isDeleting }] = useDeleteIncomeEntryMutation()

  const canManage = role === 'admin' && canManageProp && isMonthOpen

  const handleEdit = (e: React.MouseEvent, incomeEntry: IncomeEntry) => {
    e.stopPropagation()
    setEditingIncomeEntry(incomeEntry)
  }

  const handleDeleteClick = (e: React.MouseEvent, incomeEntryId: number) => {
    e.stopPropagation()
    setDeletingIncomeEntryId(incomeEntryId)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingIncomeEntryId) return

    try {
      await deleteIncomeEntry({ id: deletingIncomeEntryId }).unwrap()
      setDeletingIncomeEntryId(null)
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      toast.error(errorMessage || t('incomeEntries.loadError'))
    }
  }

  const handleDeleteCancel = () => {
    setDeletingIncomeEntryId(null)
  }

  // formatCurrency removed - using formatMoneyKGS instead

  const columns = [
    { key: 'amount', label: t('incomeEntries.columns.amount') },
    { key: 'received_at', label: t('incomeEntries.columns.receivedAt') },
    { key: 'comment', label: t('incomeEntries.columns.comment') },
    { key: 'created_by_username', label: t('incomeEntries.columns.createdBy') },
    { key: 'created_at', label: t('incomeEntries.columns.createdAt') },
    ...(canManage ? [{ key: 'actions', label: t('incomeEntries.columns.actions') }] : []),
  ]

  const tableData = useMemo(() => {
    if (!data?.results) return []

    return data.results.map((entry) => ({
      ...entry,
      amount: formatMoneyKGS(entry.amount),
      received_at: formatDate(entry.received_at),
      created_at: formatDate(entry.created_at),
      actions: canManage ? (
        <div style={{ display: 'flex', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={(e) => handleEdit(e, entry)}>
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={(e) => handleDeleteClick(e, entry.id)}
            disabled={isDeleting}
          >
            {t('common.delete')}
          </Button>
        </div>
      ) : null,
    }))
  }, [data, canManage, isDeleting, t])

  return (
    <div className="income-entries-list">
      <div className="list-header">
        {canManage && (
          <Button onClick={() => setShowCreateModal(true)}>
            {t('incomeEntries.create')}
          </Button>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton columnCount={6} />
      ) : error ? (
        <div className="error">{t('incomeEntries.loadError')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('incomeEntries.empty.title')}</p>
          {canManage && (
            <Button onClick={() => setShowCreateModal(true)}>
              {t('incomeEntries.empty.cta')}
            </Button>
          )}
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}

      {canManage && (
        <>
          <CreateIncomeEntryModal
            isOpen={showCreateModal}
            onClose={() => setShowCreateModal(false)}
            financePeriodId={financePeriodId}
          />
          <EditIncomeEntryModal
            isOpen={!!editingIncomeEntry}
            onClose={() => setEditingIncomeEntry(null)}
            incomeEntry={editingIncomeEntry}
          />
          <Modal
            isOpen={!!deletingIncomeEntryId}
            onClose={handleDeleteCancel}
            title={t('incomeEntries.delete.title')}
            closeOnBackdropClick={false}
          >
            <div style={{ padding: '1rem 0' }}>
              <p>{t('incomeEntries.delete.message')}</p>
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

