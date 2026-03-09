import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatKGS, formatDate } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import './ReportsTable.css'

interface IncomeActualTableProps {
  items: Array<{
    id: number
    finance_period: number
    finance_period_fund_kind: string
    finance_period_month: string
    source?: { id: number, name: string } | null
    amount: string
    received_at: string
    comment: string
    created_by: number
    created_by_username: string
  }>
  monthStatus: 'OPEN' | 'LOCKED' | null
  loading: boolean
}

export function IncomeActualTable({ items, monthStatus, loading }: IncomeActualTableProps) {
  const { t } = useTranslation('reports')
  const { role } = useAuth()
  const canEdit = monthStatus === 'OPEN' || role === 'admin'

  const columns = [
    { key: 'date', label: t('income.tables.actual.columns.date') },
    { key: 'source_name', label: t('income.tables.actual.columns.sourceName') },
    { key: 'amount', label: t('income.tables.actual.columns.amount') },
    { key: 'comment', label: t('income.tables.actual.columns.comment') },
    { key: 'created_by', label: t('income.tables.actual.columns.createdBy') },
    ...(canEdit ? [{ key: 'actions', label: t('income.tables.actual.columns.actions') }] : []),
  ]

  const tableData = items.map((item) => ({
    date: formatDate(item.received_at),
    source_name: item.source?.name ?? 'N/A',
    amount: formatKGS(parseFloat(item.amount)),
    comment: item.comment,
    created_by: item.created_by_username,
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
    return <div className="table-empty-message">{t('income.tables.actual.empty')}</div>
  }

  return <Table columns={columns} data={tableData} />
}

