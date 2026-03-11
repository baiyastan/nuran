import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetBudgetReportQuery, useUpdateSummaryCommentMutation } from '@/shared/api/budgetsApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { formatDate, formatCurrency, getErrorMessage } from '@/shared/lib/utils'
import './BudgetDetailPage.css'

function BudgetDetailPage() {
  const { t } = useTranslation()
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
      setCommentError(t('budgetReport.detail.commentRequired'))
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
      setCommentError(getErrorMessage(err) || t('budgetReport.detail.saveFailed'))
    }
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (error) {
    return <div className="budget-detail-page error">{t('budgetReport.detail.errorLoading')}</div>
  }

  if (!report) {
    return <div className="budget-detail-page error">{t('budgetReport.detail.notFound')}</div>
  }

  const plannedTotal = parseFloat(report.planned_total)
  const actualTotal = parseFloat(report.actual_total)
  const delta = parseFloat(report.delta)

  const totalsColumns = [
    { key: 'label', label: t('budgetReport.detail.metric') },
    { key: 'value', label: t('budgetReport.detail.amount') },
  ]

  const totalsData = [
    { label: t('budgetReport.detail.plannedTotal'), value: formatCurrency(plannedTotal) },
    { label: t('budgetReport.detail.actualTotal'), value: formatCurrency(actualTotal) },
    {
      label: t('budgetReport.detail.delta'),
      value: (
        <span style={{ color: delta > 0 ? '#dc3545' : delta < 0 ? '#198754' : '#6c757d' }}>
          {formatCurrency(delta)}
        </span>
      ),
    },
    {
      label: t('budgetReport.detail.overBudget'),
      value: report.over_budget ? (
        <span style={{ color: '#dc3545', fontWeight: 'bold' }}>{t('budgetReport.detail.yes')}</span>
      ) : (
        <span style={{ color: '#198754' }}>{t('budgetReport.detail.no')}</span>
      ),
    },
  ]

  const categoryColumns = [
    { key: 'category_name', label: t('budgetReport.detail.category') },
    { key: 'planned', label: t('budgetReport.detail.planned') },
    { key: 'actual', label: t('budgetReport.detail.actual') },
    { key: 'delta', label: t('budgetReport.detail.delta') },
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
    { key: 'date', label: t('budgetReport.detail.date') },
    { key: 'category_name', label: t('budgetReport.detail.category') },
    { key: 'amount', label: t('budgetReport.detail.amount') },
    { key: 'comment', label: t('budgetReport.detail.comment') },
    { key: 'created_by', label: t('budgetReport.detail.createdBy') },
  ]

  const expensesData = report.expenses.map((expense) => ({
    ...expense,
    date: formatDate(expense.date),
    amount: formatCurrency(parseFloat(expense.amount)),
  }))

  return (
    <div className="budget-detail-page">
      <div className="page-header">
        <h2>{t('budgetReport.detail.reportTitle')}</h2>
      </div>

      <div className="summary-section">
        <h3>{t('budgetReport.detail.summary')}</h3>
        <Table columns={totalsColumns} data={totalsData} />
      </div>

      <div className="category-section">
        <h3>{t('budgetReport.detail.perCategoryBreakdown')}</h3>
        {report.per_category.length === 0 ? (
          <div className="empty-state">{t('budgetReport.detail.noCategoriesFound')}</div>
        ) : (
          <Table columns={categoryColumns} data={categoryData} />
        )}
      </div>

      <div className="expenses-section">
        <h3>{t('budgetReport.detail.expenses')}</h3>
        {report.expenses.length === 0 ? (
          <div className="empty-state">{t('budgetReport.detail.noExpensesFound')}</div>
        ) : (
          <Table columns={expensesColumns} data={expensesData} />
        )}
      </div>

      <div className="summary-comment-section">
        <h3>{t('budgetReport.detail.finalComment')}</h3>
        <textarea
          className={`summary-comment-textarea ${commentError ? 'error' : ''}`}
          value={summaryComment}
          onChange={(e) => {
            setSummaryComment(e.target.value)
            setCommentError('')
          }}
          rows={6}
          placeholder={t('budgetReport.detail.finalCommentPlaceholder')}
        />
        {commentError && <div className="error-message">{commentError}</div>}
        <div className="comment-actions">
          <Button
            onClick={handleSaveComment}
            disabled={isSavingComment || !summaryComment.trim()}
          >
            {isSavingComment ? t('budgetReport.detail.saving') : t('budgetReport.detail.saveComment')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default BudgetDetailPage

