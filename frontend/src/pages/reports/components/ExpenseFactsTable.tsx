import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatKGS, formatDate } from '@/shared/lib/utils'
import { ActualExpense } from '@/entities/actual-expense/model'
import './ReportsTable.css'

function actualsHaveAnyComment(items: ActualExpense[]) {
  return items.some((i) => String(i.comment ?? '').trim().length > 0)
}

interface ExpenseFactsTableProps {
  items?: ActualExpense[]
  loading: boolean
  error?: unknown | null
  /** `when-nonempty`: hide comment column unless at least one row has a comment. */
  commentColumn?: 'always' | 'when-nonempty'
}

export function ExpenseFactsTable({
  items,
  loading,
  error,
  commentColumn = 'always',
}: ExpenseFactsTableProps) {
  const { t } = useTranslation('reports')

  const showCommentCol =
    commentColumn === 'always' ||
    (items !== undefined && items.length > 0 && actualsHaveAnyComment(items))

  const columns = [
    { key: 'date', label: t('expense.tables.actual.columns.date') },
    { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
    { key: 'amount', label: t('expense.tables.actual.columns.amount') },
    ...(showCommentCol ? [{ key: 'comment', label: t('expense.tables.actual.columns.comment') }] : []),
  ]

  const skeletonCols = commentColumn === 'when-nonempty' ? 3 : 4

  if (loading || items === undefined) {
    return <TableSkeleton columnCount={skeletonCols} />
  }

  if (error) {
    return <div className="table-empty-message">{t('errors.loadReport')}</div>
  }

  if (items.length === 0) {
    return <div className="table-empty-message">{t('expense.tables.actual.empty')}</div>
  }

  const tableData = items.map((item) => {
    const fallbackCategoryName = 'Uncategorized'
    const categoryFromObject =
      item.category != null && typeof item.category === 'object'
        ? (item.category as { name?: string | null }).name ?? null
        : null

    const row: Record<string, string> = {
      date: formatDate(item.spent_at),
      category_name: item.category_name ?? categoryFromObject ?? fallbackCategoryName,
      amount: formatKGS(parseFloat(item.amount)),
    }
    if (showCommentCol) {
      row.comment = item.comment?.trim() ? item.comment : '—'
    }
    return row
  })

  return <Table columns={columns} data={tableData} />
}

