import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListPlanPeriodsQuery,
  useCreatePlanPeriodMutation,
  useLockPlanPeriodMutation,
  useUnlockPlanPeriodMutation,
  PlanPeriodListParams,
} from '@/shared/api/planPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import './PlanPeriodsPage.css'

function PlanPeriodsPage() {
  const { t } = useTranslation()
  const [filters] = useState<PlanPeriodListParams>({})
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7)
  })
  const { data, isLoading, error } = useListPlanPeriodsQuery(filters)
  const [createPlanPeriod] = useCreatePlanPeriodMutation()
  const [lockPlanPeriod] = useLockPlanPeriodMutation()
  const [unlockPlanPeriod] = useUnlockPlanPeriodMutation()
  const { role } = useAuth()

  const canManage = role === 'admin'

  // Extract error status code
  const errorStatus = (error as any)?.status

  const handleMonthAction = async (recordId: number | null, month: string, currentStatus?: 'OPEN' | 'LOCKED') => {
    try {
      if (!currentStatus) {
        // Create month with OPEN status
        await createPlanPeriod({
          period: month,
          status: 'open',
        }).unwrap()
      } else if (currentStatus === 'OPEN') {
        // Lock month
        if (recordId) {
          await lockPlanPeriod(recordId).unwrap()
        }
      } else if (currentStatus === 'LOCKED') {
        // Unlock month
        if (recordId) {
          await unlockPlanPeriod(recordId).unwrap()
        }
      }
    } catch (error) {
      console.error('Month action failed:', getErrorMessage(error))
    }
  }

  // Normalize status to uppercase for consistent comparison
  const normalizeStatus = (status: string): 'OPEN' | 'LOCKED' | string => {
    if (status === 'open' || status === 'OPEN') return 'OPEN'
    if (status === 'locked' || status === 'LOCKED') return 'LOCKED'
    return status
  }

  const getStatusBadge = (status: string) => {
    // Map PlanPeriod statuses to display format
    const isOpen = status === 'open' || status === 'OPEN'
    const isLocked = status === 'locked' || status === 'LOCKED'
    
    const statusText = isOpen
      ? t('planPeriods.statuses.open')
      : isLocked
      ? t('planPeriods.statuses.locked')
      : status
    
    const colors: Record<string, string> = {
      open: '#198754',
      OPEN: '#198754',
      locked: '#dc3545',
      LOCKED: '#dc3545',
    }
    
    return (
      <span
        style={{
          padding: '6px 12px',
          borderRadius: '4px',
          backgroundColor: colors[status] || '#6c757d',
          color: 'white',
          fontSize: '13px',
          fontWeight: '500',
        }}
      >
        {statusText}
      </span>
    )
  }

  const getActionButton = (recordId: number, month: string, status?: string) => {
    if (!canManage) {
      return <span>-</span>
    }

    const normalizedStatus = status ? normalizeStatus(status) : null
    
    if (!normalizedStatus || (normalizedStatus !== 'OPEN' && normalizedStatus !== 'LOCKED')) {
      return (
        <Button
          size="small"
          onClick={() => handleMonthAction(null, month)}
        >
          {t('planPeriods.createMonth')}
        </Button>
      )
    } else if (normalizedStatus === 'OPEN') {
      return (
        <Button
          size="small"
          onClick={() => handleMonthAction(recordId, month, 'OPEN')}
        >
          {t('planPeriods.closeMonth')}
        </Button>
      )
    } else if (normalizedStatus === 'LOCKED') {
      return (
        <Button
          size="small"
          onClick={() => handleMonthAction(recordId, month, 'LOCKED')}
        >
          {t('planPeriods.openMonth')}
        </Button>
      )
    }
    return null
  }

  const getProjectDisplay = (record: any) => {
    if (record.project_name) {
      return record.project_name
    }
    if (record.project) {
      return `#${record.project}`
    }
    return '-'
  }

  const columns = [
    { key: 'project', label: t('planPeriods.columns.project') },
    { key: 'period', label: t('planPeriods.columns.month') },
    { key: 'status', label: t('planPeriods.columns.status') },
    { key: 'created_at', label: t('planPeriods.columns.createdAt') },
    { key: 'actions', label: t('planPeriods.columns.actions') },
  ]

  const tableData = data?.results.map((record) => ({
    ...record,
    project: getProjectDisplay(record),
    period: record.period,
    status: getStatusBadge(record.status),
    created_at: formatDate(record.created_at),
    actions: getActionButton(record.id, record.period, record.status),
  })) || []

  return (
    <div className="plan-periods-page">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <h2 style={{ margin: 0 }}>{t('planPeriods.title')}</h2>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
          </div>
          <p className="help-text">{t('planPeriods.helpText')}</p>
        </div>
      </div>
      
      {isLoading ? (
        <div className="loading">{t('planPeriods.loading')}</div>
      ) : error ? (
        <div className="error">
          {errorStatus === 401 ? (
            <>
              <p>{t('planPeriods.error401')}</p>
            </>
          ) : errorStatus === 403 ? (
            <p>{t('planPeriods.error403')}</p>
          ) : (
            <>
              <p>{t('planPeriods.error')}</p>
              {import.meta.env.DEV && errorStatus && (
                <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                  Status: {errorStatus}
                </p>
              )}
            </>
          )}
        </div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('planPeriods.empty')}</p>
          {canManage && (
            <Button onClick={() => {
              handleMonthAction(null, selectedMonth)
            }}>
              {t('planPeriods.createMonth')}
            </Button>
          )}
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

export default PlanPeriodsPage
