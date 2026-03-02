import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useGetBudgetReportQuery, useUpdateSummaryCommentMutation } from '@/shared/api/budgetsApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { formatDate, formatCurrency, getErrorMessage } from '@/shared/lib/utils'
import './BudgetDetailPage.css'

function BudgetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const budgetId = id ? parseInt(id, 10) : 0
  const { data: report, isLoading, error, refetch } = useGetBudgetReportQuery(budgetId)
  const [updateSummaryComment, { isLoading: isSavingComment }] = useUpdateSummaryCommentMutation()
  
  const [summaryComment, setSummaryComment] = useState('')
  const [commentError, setCommentError] = useState('')

  useEffect(() => {
    if (report?.summary_comment) {
      setSummaryComment(report.summary_comment)
    }
  }, [report])

  const handleSaveComment = async () => {
    if (!summaryComment.trim()) {
      setCommentError('Comment is required')
      return
    }

    setCommentError('')
    try {
      await updateSummaryComment({
        budgetId,
        data: { comment_text: summaryComment.trim() },
      }).unwrap()
      refetch()
    } catch (err: unknown) {
      setCommentError(getErrorMessage(err) || 'Failed to save comment')
    }
  }

  if (isLoading) {
    return <div className="budget-detail-page loading">Loading...</div>
  }

  if (error) {
    return <div className="budget-detail-page error">Error loading budget report</div>
  }

  if (!report) {
    return <div className="budget-detail-page error">Budget not found</div>
  }

  const plannedTotal = parseFloat(report.planned_total)
  const actualTotal = parseFloat(report.actual_total)
  const delta = parseFloat(report.delta)

  const totalsColumns = [
    { key: 'label', label: 'Metric' },
    { key: 'value', label: 'Amount' },
  ]

  const totalsData = [
    { label: 'Planned Total', value: formatCurrency(plannedTotal) },
    { label: 'Actual Total', value: formatCurrency(actualTotal) },
    {
      label: 'Delta',
      value: (
        <span style={{ color: delta > 0 ? '#dc3545' : delta < 0 ? '#198754' : '#6c757d' }}>
          {formatCurrency(delta)}
        </span>
      ),
    },
    {
      label: 'Over Budget',
      value: report.over_budget ? (
        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>Yes</span>
      ) : (
        <span style={{ color: '#198754' }}>No</span>
      ),
    },
  ]

  const categoryColumns = [
    { key: 'category_name', label: 'Category' },
    { key: 'planned', label: 'Planned' },
    { key: 'actual', label: 'Actual' },
    { key: 'delta', label: 'Delta' },
  ]

  const categoryData = report.per_category.map((cat) => ({
    ...cat,
    planned: formatCurrency(parseFloat(cat.planned)),
    actual: formatCurrency(parseFloat(cat.actual)),
    delta: (
      <span
        style={{
          color: parseFloat(cat.delta) > 0 ? '#dc3545' : parseFloat(cat.delta) < 0 ? '#198754' : '#6c757d',
        }}
      >
        {formatCurrency(parseFloat(cat.delta))}
      </span>
    ),
  }))

  const expensesColumns = [
    { key: 'date', label: 'Date' },
    { key: 'category_name', label: 'Category' },
    { key: 'amount', label: 'Amount' },
    { key: 'comment', label: 'Comment' },
    { key: 'created_by', label: 'Created By' },
  ]

  const expensesData = report.expenses.map((expense) => ({
    ...expense,
    date: formatDate(expense.date),
    amount: formatCurrency(parseFloat(expense.amount)),
  }))

  return (
    <div className="budget-detail-page">
      <div className="page-header">
        <h2>Budget Plan Report</h2>
      </div>

      <div className="summary-section">
        <h3>Summary</h3>
        <Table columns={totalsColumns} data={totalsData} />
      </div>

      <div className="category-section">
        <h3>Per Category Breakdown</h3>
        {report.per_category.length === 0 ? (
          <div className="empty-state">No categories found</div>
        ) : (
          <Table columns={categoryColumns} data={categoryData} />
        )}
      </div>

      <div className="expenses-section">
        <h3>Expenses</h3>
        {report.expenses.length === 0 ? (
          <div className="empty-state">No expenses found</div>
        ) : (
          <Table columns={expensesColumns} data={expensesData} />
        )}
      </div>

      <div className="summary-comment-section">
        <h3>Final Comment</h3>
        <textarea
          className={`summary-comment-textarea ${commentError ? 'error' : ''}`}
          value={summaryComment}
          onChange={(e) => {
            setSummaryComment(e.target.value)
            setCommentError('')
          }}
          rows={6}
          placeholder="Enter final comment for this budget plan..."
        />
        {commentError && <div className="error-message">{commentError}</div>}
        <div className="comment-actions">
          <Button
            onClick={handleSaveComment}
            disabled={isSavingComment || !summaryComment.trim()}
          >
            {isSavingComment ? 'Saving...' : 'Save Comment'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default BudgetDetailPage

