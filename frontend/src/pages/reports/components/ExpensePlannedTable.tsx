import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatKGS } from '@/shared/lib/utils'
import './ReportsTable.css'

interface ExpensePlannedTableProps {
  lines: Array<{
    id: number
    plan: number
    category: number
    category_name: string
    amount_planned: string
    note: string
  }>
  budgetPlanStatus?: string
  loading: boolean
  showNoteColumn?: boolean
}

export function ExpensePlannedTable({
  lines,
  budgetPlanStatus,
  loading,
  showNoteColumn = true,
}: ExpensePlannedTableProps) {
  const { t } = useTranslation('reports')
  const canEdit = budgetPlanStatus === 'OPEN'

  const columns = [
    { key: 'category_name', label: t('expense.tables.planned.columns.categoryName') },
    { key: 'amount_planned', label: t('expense.tables.planned.columns.plannedAmount') },
    ...(showNoteColumn ? [{ key: 'note', label: t('expense.tables.planned.columns.note') }] : []),
    ...(canEdit ? [{ key: 'actions', label: t('expense.tables.planned.columns.actions') }] : []),
  ]

  const tableData = lines.map((line) => ({
    category_name: line.category_name,
    amount_planned: formatKGS(parseFloat(line.amount_planned)),
    ...(showNoteColumn ? { note: line.note || '—' } : {}),
    actions: canEdit ? (
      <div className="table-actions">
        {/* Actions can be added later */}
      </div>
    ) : null,
  }))

  if (loading) {
    return <TableSkeleton columnCount={columns.length} />
  }

  if (lines.length === 0) {
    return <div className="table-empty-message">{t('expense.tables.planned.empty')}</div>
  }

  return <Table columns={columns} data={tableData} />
}

