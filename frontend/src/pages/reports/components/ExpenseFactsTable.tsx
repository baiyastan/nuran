import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatKGS, formatDate } from '@/shared/lib/utils'
import { ActualExpense } from '@/entities/actual-expense/model'
import './ReportsTable.css'

interface ExpenseFactsTableProps {
  items?: ActualExpense[]
  loading: boolean
  error?: unknown | null
}

export function ExpenseFactsTable({ items, loading, error }: ExpenseFactsTableProps) {
  const { t } = useTranslation('reports')

  const columns = [
    { key: 'date', label: t('expense.tables.actual.columns.date') },
    { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
    { key: 'amount', label: t('expense.tables.actual.columns.amount') },
    { key: 'comment', label: t('expense.tables.actual.columns.comment') },
  ]

  // Treat undefined items as loading: do not show empty message
  if (loading || items === undefined) {
    return <TableSkeleton columnCount={4} />
  }

  if (error) {
    return <div className="table-loading">{t('expense.tables.actual.loading')}</div>
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

    return {
      date: formatDate(item.spent_at),
      category_name: item.category_name ?? categoryFromObject ?? fallbackCategoryName,
      amount: formatKGS(parseFloat(item.amount)),
      comment: item.comment,
    }
  })

  return <Table columns={columns} data={tableData} />
}

