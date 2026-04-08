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
  /** Optional monthly planned totals by category id for plan-vs-fact comparison. */
  plannedByCategory?: Record<string, number>
  plannedByCategoryName?: Record<string, number>
  showPlanComparison?: boolean
}

export function ExpenseFactsTable({
  items,
  loading,
  error,
  commentColumn = 'always',
  plannedByCategory,
  plannedByCategoryName,
  showPlanComparison = false,
}: ExpenseFactsTableProps) {
  const { t } = useTranslation('reports')

  const showCommentCol =
    commentColumn === 'always' ||
    (items !== undefined && items.length > 0 && actualsHaveAnyComment(items))

  const columns = [
    { key: 'date', label: t('expense.tables.actual.columns.date') },
    { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
    ...(showPlanComparison
      ? [
          { key: 'planned_amount', label: t('expense.tables.actual.columns.plannedAmount') },
        ]
      : []),
    { key: 'amount', label: t('expense.tables.actual.columns.amount') },
    ...(showPlanComparison
      ? [
          { key: 'difference', label: t('expense.tables.actual.columns.difference') },
        ]
      : []),
    ...(showCommentCol ? [{ key: 'comment', label: t('expense.tables.actual.columns.comment') }] : []),
  ]

  const skeletonCols =
    (showPlanComparison ? 2 : 0) + (commentColumn === 'when-nonempty' ? 3 : 4)

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
    if (showPlanComparison) {
      const categoryId =
        item.category_id ??
        (typeof item.category === 'number' ? item.category : null)
      const normalizedName = String(row.category_name).trim().toLowerCase()
      const planned =
        plannedByCategory?.[String(categoryId ?? 'null')] ??
        plannedByCategoryName?.[normalizedName] ??
        0
      const actual = parseFloat(item.amount)
      row.planned_amount = formatKGS(planned)
      row.difference = formatKGS(actual - planned)
    }
    if (showCommentCol) {
      row.comment = item.comment?.trim() ? item.comment : '—'
    }
    return row
  })

  return <Table columns={columns} data={tableData} />
}

