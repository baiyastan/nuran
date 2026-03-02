import { useState, useEffect, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateExpenseMutation, useUpdateExpenseMutation, Expense } from '@/shared/api/expensesApi'
import { useListPlanItemsQuery } from '@/shared/api/planItemsApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './ExpenseForm.css'

interface ExpenseFormProps {
  planPeriodId: number
  fundKind?: 'project' | 'office' | 'charity'
  expense?: Expense | null
  onSuccess?: () => void
  onCancel?: () => void
}

export function ExpenseForm({ planPeriodId, fundKind: _fundKind, expense, onSuccess, onCancel }: ExpenseFormProps) {
  const { t } = useTranslation()
  const isEdit = !!expense

  const [formData, setFormData] = useState({
    spent_at: expense?.spent_at || new Date().toISOString().split('T')[0],
    amount: expense?.amount || '',
    plan_item: expense?.plan_item?.toString() || '',
    comment: expense?.comment || '',
  })
  const [error, setError] = useState('')

  const [createExpense, { isLoading: isCreating }] = useCreateExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation()

  const isLoading = isCreating || isUpdating

  // Track previous values to detect actual changes
  const prevPlanPeriodIdRef = useRef(planPeriodId)

  // Fetch PlanItems for the selected plan period
  const { data: planItemsData } = useListPlanItemsQuery(
    planPeriodId ? { plan_period_id: planPeriodId } : undefined,
    { skip: !planPeriodId }
  )

  const planItems = useMemo(() => planItemsData?.results ?? [], [planItemsData])

  // Get selected plan item to show category
  const selectedPlanItem = useMemo(() => {
    if (!formData.plan_item) return null
    return planItems.find((item) => item.id === Number(formData.plan_item)) || null
  }, [formData.plan_item, planItems])

  useEffect(() => {
    if (expense) {
      setFormData({
        spent_at: expense.spent_at.split('T')[0],
        amount: expense.amount,
        plan_item: expense.plan_item?.toString() || '',
        comment: expense.comment || '',
      })
    }
  }, [expense])

  // Reset plan_item when planPeriodId actually changes
  useEffect(() => {
    const planPeriodIdChanged = prevPlanPeriodIdRef.current !== planPeriodId

    if (planPeriodIdChanged) {
      setFormData((prev) => ({
        ...prev,
        plan_item: '',
      }))
    }

    prevPlanPeriodIdRef.current = planPeriodId
  }, [planPeriodId])

  const validateForm = (): string | null => {
    const amountNum = Number(formData.amount)
    if (!formData.amount.trim() || isNaN(amountNum) || amountNum <= 0) {
      return t('expensesPage.form.errors.amountPositive')
    }

    if (!formData.plan_item) {
      return t('expensesPage.form.errors.planRowRequired')
    }

    if (!formData.comment.trim()) {
      return t('expensesPage.form.errors.commentRequired')
    }

    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      const expenseData = {
        plan_period: planPeriodId,
        plan_item: Number(formData.plan_item),
        spent_at: formData.spent_at,
        amount: formData.amount,
        comment: formData.comment.trim(),
      }

      if (isEdit && expense) {
        await updateExpense({ id: expense.id, data: expenseData }).unwrap()
      } else {
        await createExpense(expenseData).unwrap()
      }

      onSuccess?.()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || t('expensesPage.form.errors.submit'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="expense-form">
      <h3>{isEdit ? t('expensesPage.form.title.edit') : t('expensesPage.form.title.create')}</h3>

      <Input
        label={t('expensesPage.form.fields.spentAt')}
        type="date"
        value={formData.spent_at}
        onChange={(e) => setFormData({ ...formData, spent_at: e.target.value })}
        required
      />

      <div className="form-field">
        <label className="form-label">{t('expensesPage.form.fields.planRow')} <span style={{ color: 'red' }}>*</span></label>
        <select
          value={formData.plan_item}
          onChange={(e) => setFormData({ ...formData, plan_item: e.target.value })}
          className="form-select"
          disabled={!planPeriodId || planItems.length === 0}
          required
        >
          <option value="">{planPeriodId ? t('expensesPage.form.fields.planRowPlaceholder') : t('expensesPage.form.fields.selectPlanPeriodFirst')}</option>
          {planItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label className="form-label">{t('expensesPage.form.fields.category') || 'Category'}</label>
        <div className="form-readonly-text">
          {selectedPlanItem?.category_name 
            ? `${t('expensesPage.form.fields.category') || 'Category'}: ${selectedPlanItem.category_name}`
            : t('expensesPage.form.fields.categoryWillBeAssigned') || 'Category will be assigned automatically'}
        </div>
      </div>

      <Input
        label={t('expensesPage.form.fields.amount')}
        type="number"
        step="0.01"
        min="0.01"
        value={formData.amount}
        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
        required
      />



      <div className="form-field">
        <label className="form-label">{t('expensesPage.form.fields.comment')} <span style={{ color: 'red' }}>*</span></label>
        <textarea
          value={formData.comment}
          onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
          className="form-textarea"
          rows={3}
          required
        />
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? t('expensesPage.form.buttons.saving') : t('expensesPage.form.buttons.save')}
        </Button>
        {onCancel && (
          <Button type="button" onClick={onCancel} variant="secondary">
            {t('expensesPage.form.buttons.cancel')}
          </Button>
        )}
      </div>
    </form>
  )
}

