import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreatePlanPeriodMutation } from '@/shared/api/planPeriodsApi'
import { useListProjectsQuery } from '@/shared/api/projectsApi'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { PlanPeriod } from '@/entities/plan-period/model'
import { getErrorMessage } from '@/shared/lib/utils'
import './CreatePlanPeriodModal.css'

interface CreatePlanPeriodModalProps {
  isOpen: boolean
  onClose: () => void
  period: string // YYYY-MM format
  onSuccess?: (planPeriodId: number) => void
  defaultPlanType?: 'project' | 'office' | 'charity'
  existingPlans?: PlanPeriod[]
}

type PlanType = 'project' | 'office' | 'charity'

export function CreatePlanPeriodModal({ 
  isOpen, 
  onClose, 
  period, 
  onSuccess,
  defaultPlanType,
  existingPlans = []
}: CreatePlanPeriodModalProps) {
  const { t } = useTranslation()
  const planType: PlanType = defaultPlanType || 'project'
  const [formData, setFormData] = useState({
    project: '',
    comments: '',
  })
  const [error, setError] = useState('')
  
  const [createPlanPeriod, { isLoading }] = useCreatePlanPeriodMutation()
  
  // Only fetch projects when creating a project plan
  const { data: projectsData } = useListProjectsQuery({}, { skip: planType !== 'project' })
  
  const projects = useMemo(() => {
    if (!projectsData || planType !== 'project') return []
    return Array.isArray(projectsData) ? projectsData : (projectsData.results || [])
  }, [projectsData, planType])

  // Check if office/charity plan already exists for this period
  const checkDuplicatePlan = useMemo(() => {
    if (planType !== 'office' && planType !== 'charity') {
      return false
    }
    
    // Check for duplicate using fund_kind + period (not project)
    return existingPlans.some(plan => 
      plan.fund_kind === planType && plan.period === period
    )
  }, [planType, existingPlans, period])
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Validation - only project plans require project selection
    if (planType === 'project' && !formData.project) {
      setError(t('planPeriods.create.step2.fields.project') + ' ' + t('planPeriods.create.required'))
      return
    }

    // Check for duplicate office/charity plans
    if (checkDuplicatePlan) {
      if (planType === 'office') {
        setError(t('planPeriods.create.step2.office.duplicate'))
      } else if (planType === 'charity') {
        setError(t('planPeriods.create.step2.charity.duplicate'))
      }
      return
    }
    
    try {
      // For project plans, use selected project ID
      // For office/charity plans, send null (no project)
      const projectId = planType === 'project' 
        ? Number(formData.project)
        : null
      
      const result = await createPlanPeriod({
        fund_kind: planType,
        project: projectId,
        period: period,
        comments: formData.comments.trim() || '',
      }).unwrap()
      
      // Reset form
      setFormData({ project: '', comments: '' })
      setError('')
      
      onSuccess?.(result.id)
      onClose()
    } catch (err: unknown) {
      setError(getErrorMessage(err))
    }
  }
  
  const handleClose = () => {
    setFormData({ project: '', comments: '' })
    setError('')
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <div className="create-plan-period-modal">
        <h3>{t('planPeriods.create.title')}</h3>
        <form onSubmit={handleSubmit} className="create-plan-step2">
            <p className="step-title">
              {planType === 'project' && t('planPeriods.create.step2.project.title')}
              {planType === 'office' && t('planPeriods.create.step2.office.title')}
              {planType === 'charity' && t('planPeriods.create.step2.charity.title')}
            </p>
            
            {planType === 'project' && (
              <div className="form-field">
                <label className="form-label">{t('planPeriods.create.step2.fields.project')}</label>
                <select
                  value={formData.project}
                  onChange={(e) => setFormData({ ...formData, project: e.target.value })}
                  className="form-select"
                  required
                >
                  <option value="">{t('planPeriods.create.step2.fields.selectProject')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="form-field">
              <label className="form-label">{t('planPeriods.create.step2.fields.comments')}</label>
              <textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                placeholder={t('planPeriods.create.step2.fields.commentsPlaceholder')}
                className="form-textarea"
                rows={3}
              />
            </div>
            
            {(planType === 'office' || planType === 'charity') && checkDuplicatePlan && (
              <div className="form-warning">
                {planType === 'office' 
                  ? t('planPeriods.create.step2.office.duplicate')
                  : t('planPeriods.create.step2.charity.duplicate')}
              </div>
            )}
            
            {error && <div className="form-error">{error}</div>}
            
            <div className="modal-actions">
              <Button type="button" onClick={handleClose} variant="secondary">
                {t('planPeriods.create.buttons.cancel')}
              </Button>
              <Button type="submit" disabled={isLoading || checkDuplicatePlan}>
                {isLoading ? t('planPeriods.create.buttons.creating') : t('planPeriods.create.buttons.create')}
              </Button>
            </div>
          </form>
      </div>
    </Modal>
  )
}

