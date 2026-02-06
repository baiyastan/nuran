import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListBudgetPlansQuery,
  useGetBudgetPlanReportQuery,
  useListExpenseCategoriesQuery,
  useCreateBudgetExpenseMutation,
  useUpdateBudgetExpenseMutation,
  BudgetPlanListParams,
  BudgetPlan,
} from '@/shared/api/budgetingApi'
import { useListProjectsQuery } from '@/shared/api/projectsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { formatKGS, getErrorMessage } from '@/shared/lib/utils'
import './BudgetReportPage.css'

interface ExpenseFormState {
  id: number | null
  category: number | ''
  amount_spent: string
  spent_at: string
  comment: string
  error: string | null
}

function BudgetReportPage() {
  const { t } = useTranslation()
  const { role } = useAuth()
  const [filters, setFilters] = useState<BudgetPlanListParams>({
    scope: 'PROJECT',
    status: 'APPROVED',
  })
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [expenseForm, setExpenseForm] = useState<ExpenseFormState>({
    id: null,
    category: '',
    amount_spent: '',
    spent_at: new Date().toISOString().split('T')[0],
    comment: '',
    error: null,
  })

  const { data: plansData, isLoading: plansLoading } = useListBudgetPlansQuery(filters)
  const { data: projectsData } = useListProjectsQuery()
  const { data: reportData, isLoading: reportLoading, refetch: refetchReport } = useGetBudgetPlanReportQuery(
    selectedPlanId!,
    { skip: !selectedPlanId }
  )
  const { data: categoriesData } = useListExpenseCategoriesQuery({
    is_active: true,
    kind: 'EXPENSE',
  })
  const [createExpense, { isLoading: isCreating }] = useCreateBudgetExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateBudgetExpenseMutation()

  const selectedPlan = plansData?.results.find((p) => p.id === selectedPlanId) || null
  const canEdit = role === 'admin' && selectedPlan?.status === 'APPROVED'

  // Filter leaf categories
  const leafCategories = categoriesData?.results.filter((cat) => {
    if (!cat.parent_id) return false // Must have parent
    // Check if it's a leaf (no active children)
    return !categoriesData.results.some((c) => c.parent_id === cat.id && c.is_active)
  }) || []

  const handlePlanSelect = (planId: number) => {
    setSelectedPlanId(planId)
    setExpenseForm({
      id: null,
      category: '',
      amount_spent: '',
      spent_at: new Date().toISOString().split('T')[0],
      comment: '',
      error: null,
    })
  }

  const handleExpenseSubmit = async () => {
    if (!selectedPlanId || !expenseForm.category || !expenseForm.amount_spent || !expenseForm.spent_at) {
      setExpenseForm((prev) => ({ ...prev, error: 'Please fill all required fields' }))
      return
    }

    setExpenseForm((prev) => ({ ...prev, error: null }))
    try {
      if (expenseForm.id) {
        // Update
        await updateExpense({
          id: expenseForm.id,
          data: {
            category: Number(expenseForm.category),
            amount_spent: parseFloat(expenseForm.amount_spent),
            spent_at: expenseForm.spent_at,
            comment: expenseForm.comment || undefined,
          },
        }).unwrap()
      } else {
        // Create
        await createExpense({
          plan: selectedPlanId,
          category: Number(expenseForm.category),
          amount_spent: parseFloat(expenseForm.amount_spent),
          spent_at: expenseForm.spent_at,
          comment: expenseForm.comment || undefined,
        }).unwrap()
      }
      setExpenseForm({
        id: null,
        category: '',
        amount_spent: '',
        spent_at: new Date().toISOString().split('T')[0],
        comment: '',
        error: null,
      })
      refetchReport()
    } catch (err: any) {
      setExpenseForm((prev) => ({
        ...prev,
        error: getErrorMessage(err),
      }))
    }
  }

  const reportColumns = [
    { key: 'category', label: t('budgetReport.columns.category') },
    { key: 'planned', label: t('budgetReport.columns.planned') },
    { key: 'spent', label: t('budgetReport.columns.spent') },
    { key: 'balance', label: t('budgetReport.columns.balance') },
    { key: 'percent', label: t('budgetReport.columns.percent') },
  ]

  const reportTableData =
    reportData?.rows.map((row) => ({
      category: row.category_name,
      planned: formatKGS(parseFloat(row.planned)),
      spent: formatKGS(parseFloat(row.spent)),
      balance: formatKGS(parseFloat(row.balance)),
      percent: row.percent !== null ? `${row.percent.toFixed(2)}%` : '-',
    })) || []

  return (
    <div className="budget-report-page">
      <div className="page-header">
        <h2>{t('budgetReport.title')}</h2>
      </div>

      <div className="filters">
        <div className="filter-group">
          <label htmlFor="filter-month">{t('budgetReport.filters.month')}</label>
          <input
            id="filter-month"
            type="month"
            value={filters.month || ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                month: e.target.value || undefined,
              }))
            }
          />
        </div>

        <div className="filter-group">
          <label htmlFor="filter-project">{t('budgetReport.filters.project')}</label>
          <select
            id="filter-project"
            value={filters.project || ''}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                project: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
          >
            <option value="">-</option>
            {projectsData?.results.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="filter-status">{t('budgetReport.filters.status')}</label>
          <select
            id="filter-status"
            value={filters.status || 'APPROVED'}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value || undefined,
              }))
            }
          >
            <option value="APPROVED">{t('submittedPlans.statuses.APPROVED')}</option>
            <option value="SUBMITTED">{t('submittedPlans.statuses.SUBMITTED')}</option>
            <option value="OPEN">{t('prorab.budgetPlan.statusOPEN')}</option>
          </select>
        </div>
      </div>

      {plansLoading ? (
        <div className="loading">{t('budgetReport.loading')}</div>
      ) : !plansData?.results.length ? (
        <div className="empty-state">{t('budgetReport.noPlansFound')}</div>
      ) : (
        <div className="plans-list">
          <h3>{t('budgetReport.selectPlan')}</h3>
          <div className="plan-cards">
            {plansData.results.map((plan: BudgetPlan) => (
              <div
                key={plan.id}
                className={`plan-card ${selectedPlanId === plan.id ? 'selected' : ''}`}
                onClick={() => handlePlanSelect(plan.id)}
              >
                <div className="plan-card-header">
                  <strong>{plan.project_name}</strong>
                  <span className="plan-status">{plan.status}</span>
                </div>
                <div className="plan-card-body">
                  <div>{plan.period_month}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPlanId && (
        <>
          {reportLoading ? (
            <div className="loading">{t('budgetReport.loading')}</div>
          ) : reportData ? (
            <>
              <div className="report-section">
                <h3>
                  {reportData.plan.project_name} - {reportData.plan.period_month}
                </h3>
                {!canEdit && selectedPlan?.status !== 'APPROVED' && (
                  <div className="warning">{t('budgetReport.planNotApproved')}</div>
                )}
                <Table columns={reportColumns} data={reportTableData} />
                <div className="report-totals">
                  <div className="total-row">
                    <strong>{t('budgetReport.totals.planned')}:</strong>
                    <span>{formatKGS(parseFloat(reportData.totals.planned))}</span>
                  </div>
                  <div className="total-row">
                    <strong>{t('budgetReport.totals.spent')}:</strong>
                    <span>{formatKGS(parseFloat(reportData.totals.spent))}</span>
                  </div>
                  <div className="total-row">
                    <strong>{t('budgetReport.totals.balance')}:</strong>
                    <span>{formatKGS(parseFloat(reportData.totals.balance))}</span>
                  </div>
                  <div className="total-row">
                    <strong>{t('budgetReport.totals.percent')}:</strong>
                    <span>
                      {reportData.totals.percent !== null
                        ? `${reportData.totals.percent.toFixed(2)}%`
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {canEdit && (
                <div className="expense-form-section">
                  <h3>
                    {expenseForm.id
                      ? t('budgetReport.form.editExpense')
                      : t('budgetReport.form.addExpense')}
                  </h3>
                  {expenseForm.error && (
                    <div className="form-error">{expenseForm.error}</div>
                  )}
                  <div className="expense-form">
                    <div className="form-group">
                      <label htmlFor="expense-category">{t('budgetReport.form.category')}</label>
                      <select
                        id="expense-category"
                        value={expenseForm.category}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({ ...prev, category: e.target.value as number | '' }))
                        }
                        required
                      >
                        <option value="">{t('budgetReport.form.selectCategory')}</option>
                        {leafCategories
                          .filter((cat) => {
                            // Filter by plan scope
                            const scopeMapping: Record<string, string> = {
                              project: 'PROJECT',
                              office: 'OFFICE',
                              charity: 'CHARITY',
                            }
                            return scopeMapping[cat.scope] === selectedPlan?.scope
                          })
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="expense-amount">{t('budgetReport.form.amount')}</label>
                      <input
                        id="expense-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={expenseForm.amount_spent}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({ ...prev, amount_spent: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="expense-date">{t('budgetReport.form.spentAt')}</label>
                      <input
                        id="expense-date"
                        type="date"
                        value={expenseForm.spent_at}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({ ...prev, spent_at: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="expense-comment">{t('budgetReport.form.comment')}</label>
                      <textarea
                        id="expense-comment"
                        value={expenseForm.comment}
                        onChange={(e) =>
                          setExpenseForm((prev) => ({ ...prev, comment: e.target.value }))
                        }
                        rows={3}
                      />
                    </div>
                    <div className="form-actions">
                      <Button
                        onClick={handleExpenseSubmit}
                        disabled={isCreating || isUpdating}
                        variant="primary"
                      >
                        {isCreating || isUpdating
                          ? t('budgetReport.buttons.saving')
                          : t('budgetReport.buttons.save')}
                      </Button>
                      {expenseForm.id && (
                        <Button
                          onClick={() =>
                            setExpenseForm({
                              id: null,
                              category: '',
                              amount_spent: '',
                              spent_at: new Date().toISOString().split('T')[0],
                              comment: '',
                              error: null,
                            })
                          }
                          variant="secondary"
                        >
                          {t('budgetReport.buttons.cancel')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">{t('budgetReport.emptyState')}</div>
          )}
        </>
      )}
    </div>
  )
}

export default BudgetReportPage

