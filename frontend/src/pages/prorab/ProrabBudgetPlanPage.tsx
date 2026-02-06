import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'
import {
  useGetProjectBudgetPlanQuery,
  useCreateBudgetPlanMutation,
  useListExpenseCategoriesQuery,
  useListBudgetLinesQuery,
  useCreateBudgetLineMutation,
  useUpdateBudgetLineMutation,
  useDeleteBudgetLineMutation,
  useSubmitBudgetPlanMutation,
} from '@/shared/api/budgetingApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './ProrabBudgetPlanPage.css'

// Format value as Kyrgyz som: "12 345,00 сом"
function formatKGS(value: number | string): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0,00 сом'
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numValue)} сом`
}

function ProrabBudgetPlanPage() {
  const { t } = useTranslation()
  const { projectId, periodId } = useParams<{ projectId: string; periodId: string }>()
  const navigate = useNavigate()
  const projectIdNum = projectId ? parseInt(projectId, 10) : 0
  const periodIdNum = periodId ? parseInt(periodId, 10) : 0

  // Fetch PlanPeriod to get month and project info
  const { data: planPeriod, isLoading: isLoadingPeriod } = useGetPlanPeriodQuery(periodIdNum)
  
  // Get root categories for project scope
  const { data: rootCategoriesData } = useListExpenseCategoriesQuery({
    scope: 'project',
    kind: 'EXPENSE',
    is_active: true,
    parent: null,
  })
  
  // Get leaf categories for project scope
  const { data: categoriesData } = useListExpenseCategoriesQuery({
    scope: 'project',
    kind: 'EXPENSE',
    is_active: true,
  })

  const rootCategories = rootCategoriesData?.results || []
  const rootCategoriesCount = rootCategories.length
  
  // Root category selection: auto-select if only one, require selection if multiple
  const [selectedRootCategoryId, setSelectedRootCategoryId] = useState<number | null>(null)

  // Update selectedRootCategoryId when rootCategories loads and only one exists
  useEffect(() => {
    if (rootCategoriesCount === 1 && rootCategories[0]?.id && !selectedRootCategoryId) {
      setSelectedRootCategoryId(rootCategories[0].id)
    }
  }, [rootCategoriesCount, rootCategories, selectedRootCategoryId])

  const rootCategoryId = selectedRootCategoryId
  const month = planPeriod?.period || ''

  // Prevent duplicate auto-create calls
  const didCreateRef = useRef(false)

  // Get or create budget plan
  const { data: budgetPlan, isLoading: isLoadingPlan, refetch: refetchPlan } = useGetProjectBudgetPlanQuery(
    { month, projectId: projectIdNum },
    { skip: !month || !projectIdNum || !rootCategoryId }
  )

  const [createBudgetPlan] = useCreateBudgetPlanMutation()
  const [submitBudgetPlan] = useSubmitBudgetPlanMutation()

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('')
  const [amount, setAmount] = useState<string>('')
  const [note, setNote] = useState<string>('')
  const [editingLineId, setEditingLineId] = useState<number | null>(null)
  const [editingAmount, setEditingAmount] = useState<string>('')
  const [editingNote, setEditingNote] = useState<string>('')

  // Get budget lines
  const { data: linesData, refetch: refetchLines } = useListBudgetLinesQuery(
    { plan: budgetPlan?.id },
    { skip: !budgetPlan?.id }
  )

  const [createBudgetLine] = useCreateBudgetLineMutation()
  const [updateBudgetLine] = useUpdateBudgetLineMutation()
  const [deleteBudgetLine] = useDeleteBudgetLineMutation()

  // Filter leaf categories (no children) - safe with nullish coalescing
  const leafCategories = categoriesData?.results?.filter(cat => (cat.children_count ?? 0) === 0) || []

  // Create budget plan if it doesn't exist - prevent duplicate calls with useRef
  useEffect(() => {
    if (!isLoadingPlan && !budgetPlan && month && projectIdNum && rootCategoryId && planPeriod && !didCreateRef.current) {
      didCreateRef.current = true
      createBudgetPlan({
        period: month,
        root_category: rootCategoryId,
        scope: 'PROJECT',
        project: projectIdNum,
      }).then(() => {
        refetchPlan()
      }).catch((err) => {
        console.error('Failed to create budget plan:', getErrorMessage(err))
        didCreateRef.current = false // Reset on error to allow retry
      })
    }
  }, [isLoadingPlan, budgetPlan, month, projectIdNum, rootCategoryId, planPeriod, createBudgetPlan, refetchPlan])

  const isEditable = budgetPlan?.status === 'OPEN'

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: '#6c757d',
      OPEN: '#198754',
      SUBMITTED: '#0d6efd',
      APPROVED: '#198754',
      CLOSED: '#dc3545',
    }
    const statusKey = `status${status}` as 'statusOPEN' | 'statusSUBMITTED' | 'statusAPPROVED' | 'statusCLOSED'
    const statusText = t(`prorab.budgetPlan.${statusKey}` as any) || status.toUpperCase()
    return (
      <span
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          backgroundColor: colors[status] || '#6c757d',
          color: 'white',
          fontSize: '14px',
          fontWeight: 'bold',
        }}
      >
        {statusText}
      </span>
    )
  }

  const handleAddLine = async () => {
    if (!budgetPlan || !selectedCategory || !amount) return

    try {
      await createBudgetLine({
        plan: budgetPlan.id,
        category: Number(selectedCategory),
        amount_planned: parseFloat(amount),
        note: note || '',
      }).unwrap()
      setSelectedCategory('')
      setAmount('')
      setNote('')
      refetchLines()
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const handleStartEdit = (line: any) => {
    setEditingLineId(line.id)
    setEditingAmount(line.amount_planned)
    setEditingNote(line.note || '')
  }

  const handleSaveEdit = async () => {
    if (!editingLineId || !editingAmount) return

    try {
      await updateBudgetLine({
        id: editingLineId,
        data: {
          amount_planned: parseFloat(editingAmount),
          note: editingNote,
        },
      }).unwrap()
      setEditingLineId(null)
      setEditingAmount('')
      setEditingNote('')
      refetchLines()
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const handleCancelEdit = () => {
    setEditingLineId(null)
    setEditingAmount('')
    setEditingNote('')
  }

  const handleDeleteLine = async (lineId: number) => {
    if (!window.confirm(t('prorab.budgetPlan.deleteConfirm'))) return

    try {
      await deleteBudgetLine(lineId).unwrap()
      refetchLines()
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const handleSubmit = async () => {
    if (!budgetPlan) return

    if (!window.confirm(t('prorab.budgetPlan.submitConfirm'))) return

    try {
      await submitBudgetPlan(budgetPlan.id).unwrap()
      refetchPlan()
      refetchLines()
    } catch (err) {
      alert(getErrorMessage(err))
    }
  }

  const totalAmount = linesData?.results?.reduce((sum, line) => sum + parseFloat(line.amount_planned), 0) || 0

  if (isLoadingPeriod || isLoadingPlan) {
    return <div className="loading">{t('prorab.budgetPlan.loading')}</div>
  }

  if (!planPeriod) {
    return <div className="error">{t('prorab.budgetPlan.error')}</div>
  }

  // Show root category selector if multiple root categories exist and none selected
  if (rootCategoriesCount > 1 && !selectedRootCategoryId) {
    return (
      <div className="prorab-budget-plan-page">
        <div className="page-header">
          <div>
            <h2>{t('prorab.budgetPlan.title')} - {planPeriod.project_name} - {month}</h2>
          </div>
          <Button onClick={() => navigate(`/prorab/projects/${projectIdNum}/plan-periods`)}>
            {t('prorab.planPeriods.buttons.backToProjects')}
          </Button>
        </div>
        <div style={{ padding: '24px', border: '1px solid #ddd', borderRadius: '4px', maxWidth: '400px', marginTop: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
            {t('prorab.budgetPlan.selectRootCategory')}
          </label>
          <select
            value={selectedRootCategoryId || ''}
            onChange={(e) => setSelectedRootCategoryId(e.target.value ? Number(e.target.value) : null)}
            style={{ width: '100%', padding: '8px', fontSize: '14px' }}
          >
            <option value="">{t('prorab.budgetPlan.selectRootCategory')}</option>
            {rootCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  if (!budgetPlan) {
    return <div className="loading">{t('prorab.budgetPlan.loading')}</div>
  }

  const columns = [
    { key: 'category_name', label: t('prorab.budgetPlan.category') },
    { key: 'amount_planned', label: t('prorab.budgetPlan.amount') },
    { key: 'note', label: t('prorab.budgetPlan.note') },
    { key: 'actions', label: '' },
  ]

  const tableData = linesData?.results?.map((line) => ({
    ...line,
    amount_planned: formatKGS(line.amount_planned),
    actions: isEditable ? (
      editingLineId === line.id ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="number"
            value={editingAmount}
            onChange={(e) => setEditingAmount(e.target.value)}
            style={{ width: '100px', padding: '4px' }}
          />
          <input
            type="text"
            value={editingNote}
            onChange={(e) => setEditingNote(e.target.value)}
            placeholder={t('prorab.budgetPlan.note')}
            style={{ width: '150px', padding: '4px' }}
          />
          <Button size="small" onClick={handleSaveEdit}>
            {t('common.save')}
          </Button>
          <Button size="small" onClick={handleCancelEdit}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button size="small" onClick={() => handleStartEdit(line)}>
            {t('prorab.budgetPlan.edit')}
          </Button>
          <Button size="small" onClick={() => handleDeleteLine(line.id)}>
            {t('prorab.budgetPlan.delete')}
          </Button>
        </div>
      )
    ) : null,
  })) || []

  return (
    <div className="prorab-budget-plan-page">
      <div className="page-header">
        <div>
          <h2>{t('prorab.budgetPlan.title')} - {planPeriod.project_name} - {month}</h2>
          <div style={{ marginTop: '8px' }}>
            {getStatusBadge(budgetPlan.status)}
          </div>
        </div>
        <Button onClick={() => navigate(`/prorab/projects/${projectIdNum}/plan-periods`)}>
          {t('prorab.planPeriods.buttons.backToProjects')}
        </Button>
      </div>

      {isEditable && (
        <div className="add-line-form" style={{ marginBottom: '24px', padding: '16px', border: '1px solid #ddd', borderRadius: '4px' }}>
          <h3>{t('prorab.budgetPlan.addLine')}</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>{t('prorab.budgetPlan.category')}</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '8px' }}
              >
                <option value="">{t('prorab.budgetPlan.selectCategory')}</option>
                {leafCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1', minWidth: '150px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>{t('prorab.budgetPlan.amount')}</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                step="0.01"
                min="0"
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>{t('prorab.budgetPlan.note')}</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ width: '100%', padding: '8px' }}
              />
            </div>
            <Button onClick={handleAddLine} disabled={!selectedCategory || !amount}>
              {t('prorab.budgetPlan.addLine')}
            </Button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <strong>{t('prorab.budgetPlan.total')}: </strong>
        {formatKGS(totalAmount)}
      </div>

      {linesData?.results && linesData.results.length > 0 ? (
        <Table columns={columns} data={tableData} />
      ) : (
        <div className="empty-state">
          <p>{t('prorab.budgetPlan.noLines')}</p>
        </div>
      )}

      {isEditable && (
        <div style={{ marginTop: '24px' }}>
          <Button
            onClick={handleSubmit}
            disabled={!linesData?.results || linesData.results.length === 0}
            variant="primary"
          >
            {t('prorab.budgetPlan.submit')}
          </Button>
          {(!linesData?.results || linesData.results.length === 0) && (
            <p style={{ marginTop: '8px', color: '#666', fontSize: '14px' }}>
              {t('prorab.budgetPlan.submitDisabled')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ProrabBudgetPlanPage

