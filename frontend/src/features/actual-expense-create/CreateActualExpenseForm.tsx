import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateActualExpenseMutation } from '@/shared/api/actualExpensesApi'
import { useListExpenseCategoriesQuery } from '@/shared/api/expenseCategoriesApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import { resolveActualExpenseCreateMutationError } from '@/shared/lib/actualExpenseCreateMutationError'
import { CreateCategoryModal } from '@/features/expense-category-create/CreateCategoryModal'
import './CreateActualExpenseForm.css'

interface CreateActualExpenseFormProps {
  financePeriodId?: number // Primary: Required for FinancePeriod architecture
  // Legacy props (deprecated - use financePeriodId instead)
  projectId?: number // @deprecated - only used if financePeriodId is missing
  periodId?: number // @deprecated - only used if financePeriodId is missing
  prorabPlanId?: number
  onSuccess?: () => void
  onCancel?: () => void
}

export function CreateActualExpenseForm({
  financePeriodId,
  projectId, // Legacy - deprecated
  periodId, // Legacy - deprecated
  prorabPlanId,
  onSuccess,
  onCancel,
}: CreateActualExpenseFormProps) {
  const { role } = useAuth()
  const canManage = role === 'admin'
  const { t } = useTranslation(['categories', 'common', 'expenses'])
  const { t: tTrans } = useTranslation()
  const [formData, setFormData] = useState({
    scope: 'project' as 'project' | 'office' | 'charity',
    categoryId: null as number | null,
    subcategoryId: null as number | null,
    amount: '',
    spent_at: new Date().toISOString().split('T')[0],
    comment: '',
  })
  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [apiError, setApiError] = useState('')
  const [balanceAlert, setBalanceAlert] = useState<{ title: string; hint: string } | null>(null)
  const [amountApiError, setAmountApiError] = useState('')
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false)
  const [isCategoryOpen, setIsCategoryOpen] = useState(false)
  const [categorySearch, setCategorySearch] = useState('')

  const [createExpense, { isLoading }] = useCreateActualExpenseMutation()

  // Fetch root categories filtered by scope
  const { data: rootCategories } = useListExpenseCategoriesQuery({
    scope: formData.scope,
    parent: null,
  })

  // Fetch subcategories when category is selected
  const { data: subcategories } = useListExpenseCategoriesQuery(
    {
      scope: formData.scope,
      parent: formData.categoryId || undefined,
    },
    { skip: !formData.categoryId }
  )

  // Reset subcategory when category changes
  useEffect(() => {
    setFormData((prev) => ({ ...prev, subcategoryId: null }))
  }, [formData.categoryId, formData.scope])

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Finance period is required - prioritize financePeriodId
    if (!financePeriodId) {
      if (projectId || periodId) {
        // Legacy fallback - warn but allow
        console.warn('Using deprecated projectId/periodId. Please use financePeriodId instead.')
      } else {
        newErrors.financePeriod = 'Finance period is required'
      }
    }

    const amountNum = Number(formData.amount)
    if (!formData.amount.trim() || isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Amount must be a positive number'
    }

    if (!formData.spent_at) {
      newErrors.spent_at = 'Date is required'
    }

    if (!formData.comment.trim()) {
      newErrors.comment = 'Comment is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')
    setBalanceAlert(null)
    setAmountApiError('')
    setErrors({})

    if (!validateForm()) {
      return
    }

    try {
      if (!financePeriodId) {
        setApiError('Finance period is required. Please provide financePeriodId.')
        return
      }

      const payload: Record<string, unknown> = {
        finance_period: financePeriodId,
        amount: Number(formData.amount),
        spent_at: formData.spent_at,
        comment: formData.comment.trim(),
      }

      // Category optional (use subcategory if selected, else root category)
      if (formData.subcategoryId) {
        payload.category = formData.subcategoryId
      } else if (formData.categoryId) {
        payload.category = formData.categoryId
      }

      if (projectId || periodId) {
        console.warn('Using deprecated projectId/periodId. Please migrate to financePeriodId.')
        if (projectId) payload.project = projectId
        if (periodId) payload.period = periodId
      }

      if (prorabPlanId) {
        payload.prorab_plan = prorabPlanId
      }

      await createExpense(payload as unknown as Parameters<ReturnType<typeof useCreateActualExpenseMutation>[0]>[0]).unwrap()
      onSuccess?.()
      setApiError('')
      setBalanceAlert(null)
      setAmountApiError('')
      setFormData({
        scope: 'project',
        categoryId: null,
        subcategoryId: null,
        amount: '',
        spent_at: new Date().toISOString().split('T')[0],
        comment: '',
      })
    } catch (err: unknown) {
      const resolved = resolveActualExpenseCreateMutationError(err, tTrans, formData.amount)
      setBalanceAlert(resolved.balanceAlert)
      setAmountApiError(resolved.amountApiError)
      setApiError(resolved.apiError)
    }
  }

  const isSubmitDisabled = isLoading || !formData.comment.trim()

  // Hide form for Director and Foreman (admin only)
  if (!canManage) {
    return null
  }

  const filteredRootCategories =
    rootCategories?.results.filter((cat) =>
      cat.name.toLowerCase().includes(categorySearch.toLowerCase())
    ) ?? []

  return (
    <>
      <form onSubmit={handleSubmit} className="create-actual-expense-form">
        <div className="form-field">
          <label className="input-label">
            {t('categories.scope')} <span style={{ color: '#dc3545' }}>*</span>
          </label>
          <select
            className={`input ${errors.scope ? 'input-error' : ''}`}
            value={formData.scope}
            onChange={(e) =>
              setFormData({
                ...formData,
                scope: e.target.value as 'project' | 'office' | 'charity',
                categoryId: null,
                subcategoryId: null,
              })
            }
            required
          >
            <option value="project">{t('categories.project')}</option>
            <option value="office">{t('categories.office')}</option>
            <option value="charity">{t('categories.charity')}</option>
          </select>
          {errors.scope && <span className="input-error-text">{errors.scope}</span>}
        </div>

        <div className="form-field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="input-label">
              {t('categories.name')}
            </label>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => setShowCreateCategoryModal(true)}
            >
              {t('categories.create')}
            </Button>
          </div>
          <div className="category-dropdown">
            <button
              type="button"
              className={`category-dropdown__control input ${
                errors.categoryId ? 'input-error' : ''
              }`}
              onClick={() => setIsCategoryOpen((open) => !open)}
            >
              {formData.categoryId
                ? rootCategories?.results.find((c) => c.id === formData.categoryId)?.name ??
                  t('expenses.form.selectCategory')
                : t('expenses.form.selectCategory')}
            </button>
            {isCategoryOpen && (
              <div className="category-dropdown__panel">
                <input
                  className="category-dropdown__search input"
                  type="text"
                  placeholder={t('common.search')}
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                />
                <div className="category-dropdown__list">
                  {filteredRootCategories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className="category-dropdown__option"
                      onClick={() => {
                        setFormData({
                          ...formData,
                          categoryId: cat.id,
                          subcategoryId: null,
                        })
                        setIsCategoryOpen(false)
                      }}
                    >
                      {cat.name}
                    </button>
                  ))}
                  {filteredRootCategories.length === 0 && (
                    <div className="category-dropdown__empty">
                      {t('expenses.form.noCategories')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {errors.categoryId && <span className="input-error-text">{errors.categoryId}</span>}
        </div>

        {formData.categoryId && (
          <div className="form-field">
            <label className="input-label">{t('expenses.form.subcategory')}</label>
            <select
              className={`input ${errors.subcategoryId ? 'input-error' : ''}`}
              value={formData.subcategoryId || ''}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  subcategoryId: e.target.value ? Number(e.target.value) : null,
                })
              }
            >
              <option value="">{t('expenses.form.none')}</option>
              {subcategories?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.subcategoryId && <span className="input-error-text">{errors.subcategoryId}</span>}
          </div>
        )}

      <Input
        label={t('budgetReport.form.amount')}
        type="number"
        step="0.01"
        min="0"
        value={formData.amount}
        onChange={(e) => {
          setFormData({ ...formData, amount: e.target.value })
          setAmountApiError('')
          setBalanceAlert(null)
          setApiError('')
          if (errors.amount) {
            setErrors((prev) => ({ ...prev, amount: '' }))
          }
        }}
        error={errors.amount || amountApiError || undefined}
        required
      />

      <Input
        label={t('expenses.form.spentAt')}
        type="date"
        value={formData.spent_at}
        onChange={(e) => setFormData({ ...formData, spent_at: e.target.value })}
        error={errors.spent_at}
        required
      />

      <div className="form-field">
        <label className="input-label">
          {t('budgetReport.form.comment')} <span style={{ color: '#dc3545' }}>*</span>
        </label>
        <textarea
          className={`input ${errors.comment ? 'input-error' : ''}`}
          value={formData.comment}
          onChange={(e) => {
            setFormData({ ...formData, comment: e.target.value })
            if (errors.comment) {
              setErrors({ ...errors, comment: '' })
            }
          }}
          rows={4}
          placeholder={t('expenses.form.comment')}
          required
        />
        {errors.comment && <span className="input-error-text">{errors.comment}</span>}
      </div>

      {balanceAlert && (
        <div className="form-error-block" role="alert">
          <p className="form-error-block__title">{balanceAlert.title}</p>
          <p className="form-error-block__hint">{balanceAlert.hint}</p>
        </div>
      )}
      {apiError && (
        <div className="form-error" role="alert">
          {apiError}
        </div>
      )}

      <div className="form-actions">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
        )}
        <Button type="submit" disabled={isSubmitDisabled}>
          {isLoading ? t('common.creating') : t('expenses.create')}
        </Button>
      </div>
    </form>

    <CreateCategoryModal
      isOpen={showCreateCategoryModal}
      onClose={() => setShowCreateCategoryModal(false)}
      defaultScope={formData.scope}
    />
  </>
  )
}

