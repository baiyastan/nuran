import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  useListPlanPeriodsQuery,
  PlanPeriodListParams,
} from '@/shared/api/planPeriodsApi'
import {
  useGetMonthPeriodQuery,
  useCreateMonthPeriodMutation,
  useOpenMonthPeriodMutation,
  useLockMonthPeriodMutation,
} from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Button } from '@/shared/ui/Button/Button'
import { CreatePlanPeriodModal } from '@/features/plan-period-create/CreatePlanPeriodModal'
import { PlanPeriod } from '@/entities/plan-period/model'
import { getErrorMessage, formatDate } from '@/shared/lib/utils'
import { toast } from '@/shared/ui/Toast/toast'
import './PlanPeriodsPage.css'

type PlanType = 'project' | 'office' | 'charity'

function PlanPeriodsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7)
  })
  const [selectedType, setSelectedType] = useState<PlanType>('project')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const { role } = useAuth()

  // Fetch plan periods filtered by selected month
  const filters: PlanPeriodListParams = useMemo(() => ({
    period: selectedMonth,
  }), [selectedMonth])

  const { data: planPeriodsData, isLoading: isLoadingPlanPeriods, error, refetch } = useListPlanPeriodsQuery(filters)
  const { data: monthPeriod, refetch: refetchMonthPeriod } = useGetMonthPeriodQuery(selectedMonth)

  // Month period mutations for admin
  const [createMonthPeriod] = useCreateMonthPeriodMutation()
  const [openMonthPeriod, { isLoading: isOpeningMonth }] = useOpenMonthPeriodMutation()
  const [lockMonthPeriod, { isLoading: isClosingMonth }] = useLockMonthPeriodMutation()

  // Check if month is open (month gate check)
  const isMonthOpen = monthPeriod?.status === 'OPEN'
  const monthStatus = isMonthOpen ? 'OPEN' : 'LOCKED'

  const canManage = role === 'admin'

  // Extract error status code
  let errorStatus: number | undefined
  if (error && typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as Record<string, unknown>).status
    errorStatus = typeof status === 'number' ? status : undefined
  }

  // Extract plan periods
  const planPeriods = useMemo(() => {
    if (!planPeriodsData) return []
    return Array.isArray(planPeriodsData) ? planPeriodsData : (planPeriodsData.results || [])
  }, [planPeriodsData])

  // Filter plan periods by selected type
  const filteredPlans = useMemo(() => {
    return planPeriods.filter((pp: PlanPeriod) => pp.fund_kind === selectedType)
  }, [planPeriods, selectedType])

  // Get status badge for plan period
  const getPlanStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    let label: string
    let color: string

    switch (statusLower) {
      case 'draft':
        label = t('planPeriods.status.draft')
        color = '#6c757d'
        break
      case 'submitted':
        label = t('planPeriods.status.submitted')
        color = '#ffc107'
        break
      case 'approved':
        label = t('planPeriods.status.approved')
        color = '#198754'
        break
      case 'locked':
        label = t('planPeriods.status.locked')
        color = '#dc3545'
        break
      default:
        label = status.toUpperCase()
        color = '#6c757d'
    }

    return (
      <span
        className="plan-status-badge"
        style={{
          backgroundColor: color,
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          fontWeight: '500',
        }}
      >
        {label}
      </span>
    )
  }

  const handleViewDetails = (planPeriodId: number) => {
    navigate(`/plan-periods/${planPeriodId}`)
  }

  const handleCreateSuccess = (planPeriodId?: number) => {
    refetch()
    if (planPeriodId) {
      navigate(`/plan-periods/${planPeriodId}`)
    }
  }

  // Month gate handlers (admin only)
  const handleOpenMonth = async () => {
    try {
      if (!monthPeriod) {
        const result = await createMonthPeriod({ month: selectedMonth }).unwrap()
        await openMonthPeriod(result.id).unwrap()
      } else {
        await openMonthPeriod(monthPeriod.id).unwrap()
      }
      refetchMonthPeriod()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      toast.error(errorMessage || t('planPeriods.filterBar.actions.openError', { defaultValue: 'Failed to open month' }))
    }
  }

  const handleCloseMonth = async () => {
    if (!monthPeriod) return
    try {
      await lockMonthPeriod(monthPeriod.id).unwrap()
      refetchMonthPeriod()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      toast.error(errorMessage || t('planPeriods.filterBar.actions.closeError', { defaultValue: 'Failed to close month' }))
    }
  }

  const getMonthStatusBadge = () => {
    if (monthStatus === 'OPEN') {
      return <span className="month-status-badge month-status-badge--open">{t('planPeriods.filterBar.status.open')}</span>
    } else {
      return <span className="month-status-badge month-status-badge--locked">{t('planPeriods.filterBar.status.locked')}</span>
    }
  }

  const isLoading = isLoadingPlanPeriods

  // Get plan type label
  const getPlanTypeLabel = (type: PlanType) => {
    switch (type) {
      case 'project':
        return t('planPeriods.filterBar.type.project')
      case 'office':
        return t('planPeriods.filterBar.type.office')
      case 'charity':
        return t('planPeriods.filterBar.type.charity')
    }
  }

  // Get plan title
  const getPlanTitle = (plan: PlanPeriod) => {
    if (plan.fund_kind === 'project') {
      return plan.project_name || t('planPeriods.filterBar.type.project')
    }
    return getPlanTypeLabel(plan.fund_kind as PlanType)
  }

  return (
    <div className="plan-periods-page">
      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="filter-bar-left">
          <label htmlFor="month-picker" className="filter-label">
            {t('planPeriods.filterBar.month')}
          </label>
          <input
            id="month-picker"
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="month-picker"
          />
        </div>

        <div className="filter-bar-center">
          <div className="type-pills">
            <button
              className={`type-pill ${selectedType === 'project' ? 'type-pill-active' : ''}`}
              onClick={() => setSelectedType('project')}
            >
              {t('planPeriods.filterBar.type.project')}
            </button>
            {role !== 'foreman' && (
              <>
                <button
                  className={`type-pill ${selectedType === 'office' ? 'type-pill-active' : ''}`}
                  onClick={() => setSelectedType('office')}
                >
                  {t('planPeriods.filterBar.type.office')}
                </button>
                <button
                  className={`type-pill ${selectedType === 'charity' ? 'type-pill-active' : ''}`}
                  onClick={() => setSelectedType('charity')}
                >
                  {t('planPeriods.filterBar.type.charity')}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="filter-bar-right">
          <div className="month-status-group">
            {getMonthStatusBadge()}
            {canManage && (
              <div className="month-action-button">
                {monthStatus === 'LOCKED' ? (
                  <Button
                    onClick={handleOpenMonth}
                    disabled={isOpeningMonth}
                    size="small"
                  >
                    {isOpeningMonth ? t('planPeriods.filterBar.actions.opening') : t('planPeriods.filterBar.actions.openMonth')}
                  </Button>
                ) : (
                  <Button
                    onClick={handleCloseMonth}
                    variant="danger"
                    disabled={isClosingMonth}
                    size="small"
                  >
                    {isClosingMonth ? t('planPeriods.filterBar.actions.closing') : t('planPeriods.filterBar.actions.closeMonth')}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plans List */}
      {isLoading ? (
        <div className="loading">{t('planPeriods.loading')}</div>
      ) : error ? (
        <div className="error">
          {errorStatus === 401 ? (
            <p>{t('planPeriods.error401')}</p>
          ) : errorStatus === 403 ? (
            <p>{t('planPeriods.error403')}</p>
          ) : (
            <p>{t('planPeriods.error')}</p>
          )}
        </div>
      ) : (
        <>
          {!isMonthOpen && (
            <div className="month-closed-banner">
              {t('planPeriods.monthClosed')}
            </div>
          )}
          
          {filteredPlans.length === 0 ? (
            <div className="empty-state">
              <h3 className="empty-state-title">{t('planPeriods.empty.title')}</h3>
              <p className="empty-state-description">{t('planPeriods.empty.description')}</p>
              {canManage && isMonthOpen && (
                <Button onClick={() => setShowCreateModal(true)} className="empty-state-button">
                  {t('planPeriods.empty.createButton')}
                </Button>
              )}
            </div>
          ) : (
            <div className="plans-grid">
              {filteredPlans.map((plan: PlanPeriod) => (
                <div key={plan.id} className="plan-card">
                  <div className="plan-card-header">
                    <h3 className="plan-card-title">{getPlanTitle(plan)}</h3>
                    {getPlanStatusBadge(plan.status)}
                  </div>
                  <div className="plan-card-body">
                    <div className="plan-card-field">
                      <span className="plan-card-label">{t('planPeriods.card.createdBy')}:</span>
                      <span className="plan-card-value">{plan.created_by_username || '—'}</span>
                    </div>
                    <div className="plan-card-field">
                      <span className="plan-card-label">{t('planPeriods.card.createdAt')}:</span>
                      <span className="plan-card-value">{formatDate(plan.created_at)}</span>
                    </div>
                  </div>
                  <div className="plan-card-actions">
                    <Button onClick={() => handleViewDetails(plan.id)} size="small">
                      {t('planPeriods.card.view')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showCreateModal && (
        <CreatePlanPeriodModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          period={selectedMonth}
          onSuccess={(planPeriodId) => handleCreateSuccess(planPeriodId)}
          defaultPlanType={selectedType}
          existingPlans={planPeriods}
        />
      )}
    </div>
  )
}

export default PlanPeriodsPage
