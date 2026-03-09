import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatKGS, formatDate } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import './ReportsTable.css'

interface ExpenseActualTableProps {
  items: Array<{
    id: number
    month_period: number
    month_period_month?: string
    scope: string
    category?: number | null
    category_id?: number | null
    category_name?: string | null
    amount: string
    spent_at: string
    comment: string
    created_by?: number
    created_by_username?: string
  }>
  monthStatus: 'OPEN' | 'LOCKED' | null
  loading: boolean
}

export function ExpenseActualTable({ items, monthStatus, loading }: ExpenseActualTableProps) {
  const { t } = useTranslation('reports')
  const { role } = useAuth()
  const canEdit = monthStatus === 'OPEN' || role === 'admin'

  const columns = [
    { key: 'date', label: t('expense.tables.actual.columns.date') },
    { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
    { key: 'amount', label: t('expense.tables.actual.columns.amount') },
    { key: 'comment', label: t('expense.tables.actual.columns.comment') },
    { key: 'created_by', label: t('expense.tables.actual.columns.createdBy') },
    ...(canEdit ? [{ key: 'actions', label: t('expense.tables.actual.columns.actions') }] : []),
  ]

  const tableData = items.map((item) => ({
    date: formatDate(item.spent_at),
    category_name: item.category_name ?? t('expense.tables.actual.uncategorized'),
    amount: formatKGS(parseFloat(item.amount)),
    comment: item.comment,
    created_by: item.created_by_username ?? '',
    actions: canEdit ? (
      <div className="table-actions">
        {/* Actions can be added later */}
      </div>
    ) : null,
  }))

  if (loading) {
    return <TableSkeleton columnCount={columns.length} />
  }

  if (items.length === 0) {
    return <div className="table-empty-message">{t('expense.tables.actual.empty')}</div>
  }

  return <Table columns={columns} data={tableData} />
}

