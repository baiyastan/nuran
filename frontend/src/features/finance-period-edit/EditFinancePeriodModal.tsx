import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpdateFinancePeriodMutation } from '@/shared/api/financePeriodsApi'
import { useListMonthPeriodsQuery } from '@/shared/api/monthPeriodsApi'
import { useListProjectsQuery } from '@/shared/api/projectsApi'
import { FinancePeriod } from '@/entities/finance-period/model'
import { Modal } from '@/shared/ui/Modal/Modal'
import { Select } from '@/shared/ui/Select/Select'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './EditFinancePeriodModal.css'

interface EditFinancePeriodModalProps {
  isOpen: boolean
  onClose: () => void
  financePeriod: FinancePeriod | null
}

export function EditFinancePeriodModal({
  isOpen,
  onClose,
  financePeriod,
}: EditFinancePeriodModalProps) {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    month_period: '',
    fund_kind: 'project' as 'project' | 'office' | 'charity',
    project: '',
    status: 'open' as 'open' | 'locked' | 'closed',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')

  const [updateFinancePeriod, { isLoading }] = useUpdateFinancePeriodMutation()
  const { data: monthPeriodsData } = useListMonthPeriodsQuery(undefined, {
    skip: !isOpen,
  })
  const { data: projectsData } = useListProjectsQuery(undefined, {
    skip: !isOpen || formData.fund_kind !== 'project',
  })

  useEffect(() => {
    if (isOpen && financePeriod) {
      setFormData({
        month_period: financePeriod.month_period.toString(),
        fund_kind: financePeriod.fund_kind,
        project: financePeriod.project?.toString() || '',
        status: financePeriod.status,
      })
      setErrors({})
      setApiError('')
    } else if (!isOpen) {
      setFormData({
        month_period: '',
        fund_kind: 'project',
        project: '',
        status: 'open',
      })
      setErrors({})
      setApiError('')
    }
  }, [isOpen, financePeriod])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.month_period) {
      newErrors.month_period = t('financePeriods.form.errors.monthPeriodRequired')
    }

    if (formData.fund_kind === 'project' && !formData.project) {
      newErrors.project = t('financePeriods.form.errors.projectRequired')
    }

    if (formData.fund_kind !== 'project' && formData.project) {
      newErrors.project = t('financePeriods.form.errors.projectMustBeEmpty')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setApiError('')

    if (!financePeriod) {
      setApiError(t('financePeriods.loadError'))
      return
    }

    if (!validateForm()) {
      return
    }

    try {
      const payload: {
        month_period: number
        fund_kind: 'project' | 'office' | 'charity'
        status: 'open' | 'locked' | 'closed'
        project?: number | null
      } = {
        month_period: parseInt(formData.month_period, 10),
        fund_kind: formData.fund_kind,
        status: formData.status,
      }

      if (formData.fund_kind === 'project') {
        payload.project = parseInt(formData.project, 10)
      } else {
        payload.project = null
      }

      await updateFinancePeriod({ id: financePeriod.id, data: payload }).unwrap()
      onClose()
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err)
      setApiError(errorMessage || t('financePeriods.loadError'))
    }
  }

  if (!financePeriod) {
    return null
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('financePeriods.editModal.title')}
      closeOnBackdropClick={true}
    >
      <form onSubmit={handleSubmit} className="edit-finance-period-form">
        <Select
          label={t('financePeriods.form.monthPeriod')}
          value={formData.month_period}
          onChange={(e) => setFormData({ ...formData, month_period: e.target.value })}
          error={errors.month_period}
          options={[
            { value: '', label: t('financePeriods.form.selectMonthPeriod') },
            ...(monthPeriodsData?.results || []).map((mp) => ({
              value: mp.id.toString(),
              label: `${mp.month} (${mp.status})`,
            })),
          ]}
          required
        />

        <Select
          label={t('financePeriods.form.fundKind')}
          value={formData.fund_kind}
          onChange={(e) =>
            setFormData({
              ...formData,
              fund_kind: e.target.value as 'project' | 'office' | 'charity',
              project: '', // Clear project when fund_kind changes
            })
          }
          options={[
            { value: 'project', label: t('financePeriods.tabs.project') },
            { value: 'office', label: t('financePeriods.tabs.office') },
            { value: 'charity', label: t('financePeriods.tabs.charity') },
          ]}
          required
        />

        {formData.fund_kind === 'project' && (
          <Select
            label={t('financePeriods.form.project')}
            value={formData.project}
            onChange={(e) => setFormData({ ...formData, project: e.target.value })}
            error={errors.project}
            options={[
              { value: '', label: t('financePeriods.form.selectProject') },
              ...(projectsData?.results || []).map((p) => ({
                value: p.id.toString(),
                label: p.name,
              })),
            ]}
            required
          />
        )}

        <Select
          label={t('financePeriods.form.status')}
          value={formData.status}
          onChange={(e) =>
            setFormData({ ...formData, status: e.target.value as 'open' | 'locked' | 'closed' })
          }
          options={[
            { value: 'open', label: t('financePeriods.statuses.open') },
            { value: 'locked', label: t('financePeriods.statuses.locked') },
            { value: 'closed', label: t('financePeriods.statuses.closed') },
          ]}
          required
        />

        {apiError && <div className="form-error">{apiError}</div>}

        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

