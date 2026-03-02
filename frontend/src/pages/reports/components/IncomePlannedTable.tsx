import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { formatKGS } from '@/shared/lib/utils'
import { useAuth } from '@/shared/hooks/useAuth'
import './ReportsTable.css'

interface IncomePlannedTableProps {
  items: Array<{
    id: number
    year: number
    month: number
    source: { id: number, name: string }
    amount: string
  }>
  monthStatus: 'OPEN' | 'LOCKED' | null
  loading: boolean
}

export function IncomePlannedTable({ items, monthStatus, loading }: IncomePlannedTableProps) {
  const { t } = useTranslation('reports')
  const { role } = useAuth()
  const canEdit = monthStatus === 'OPEN' || role === 'admin'

  const columns = [
    { key: 'source_name', label: t('income.tables.planned.columns.sourceName') },
    { key: 'amount', label: t('income.tables.planned.columns.plannedAmount') },
    ...(canEdit ? [{ key: 'actions', label: t('income.tables.planned.columns.actions') }] : []),
  ]

  const tableData = items.map((item) => ({
    source_name: item.source.name,
    amount: formatKGS(parseFloat(item.amount)),
    actions: canEdit ? (
      <div className="table-actions">
        {/* Actions can be added later */}
      </div>
    ) : null,
  }))

  if (loading) {
    return <div className="table-loading">{t('income.tables.planned.loading')}</div>
  }

  if (items.length === 0) {
    return <div className="table-empty-message">{t('income.tables.planned.empty')}</div>
  }

  return <Table columns={columns} data={tableData} />
}

