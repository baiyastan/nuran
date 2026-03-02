import { useTranslation } from 'react-i18next'
import { PlanPeriod } from '@/entities/plan-period/model'
import { Button } from '@/shared/ui/Button/Button'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import './PlanPeriodCard.css'

interface PlanPeriodCardProps {
  planPeriod: PlanPeriod
  onLock?: () => void
  onUnlock?: () => void
  onView?: () => void
  canManage?: boolean
}

export function PlanPeriodCard({ planPeriod, onLock, onUnlock, onView, canManage }: PlanPeriodCardProps) {
  const { t } = useTranslation()
  
  const getStatusBadge = (status: string) => {
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
      case 'open':
        label = t('planPeriods.status.open')
        color = '#0d6efd'
        break
      case 'closed':
        label = t('planPeriods.status.closed')
        color = '#dc3545'
        break
      default:
        label = status.toUpperCase()
        color = '#6c757d'
    }
    
    return (
      <span
        className="status-chip"
        style={{
          backgroundColor: color,
          color: 'white',
        }}
      >
        {label}
      </span>
    )
  }
  
  const isLocked = planPeriod.status.toLowerCase() === 'locked' || planPeriod.status.toLowerCase() === 'closed'
  
  return (
    <div className="plan-period-card">
      <div className="card-header">
        <div>
          <h4>{planPeriod.project_name}</h4>
          <p className="card-period">{planPeriod.period}</p>
        </div>
        {getStatusBadge(planPeriod.status)}
      </div>
      
      <div className="card-body">
        {planPeriod.limit_amount && (
          <div className="card-field">
            <span className="field-label">{t('planPeriods.card.limitAmount')}:</span>
            <span className="field-value">{formatMoneyKGS(planPeriod.limit_amount)}</span>
          </div>
        )}
        
        <div className="card-field">
          <span className="field-label">{t('planPeriods.card.createdBy')}:</span>
          <span className="field-value">{planPeriod.created_by_username || '-'}</span>
        </div>
        
        {planPeriod.comments && (
          <div className="card-field">
            <span className="field-label">{t('planPeriods.card.comments')}:</span>
            <span className="field-value">{planPeriod.comments}</span>
          </div>
        )}
      </div>
      
      <div className="card-actions">
        {onView && (
          <Button size="small" onClick={onView}>
            {t('planPeriods.card.actions.view')}
          </Button>
        )}
        {canManage && (
          <>
            {isLocked ? (
              <Button size="small" onClick={onUnlock}>
                {t('planPeriods.card.actions.unlock')}
              </Button>
            ) : (
              <Button size="small" onClick={onLock}>
                {t('planPeriods.card.actions.lock')}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}




