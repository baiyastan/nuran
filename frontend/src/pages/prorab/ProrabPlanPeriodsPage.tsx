import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetProrabPlanPeriodsQuery } from '@/shared/api/prorabApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './ProrabPlanPeriodsPage.css'

function ProrabPlanPeriodsPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = id ? parseInt(id, 10) : 0
  const { data, isLoading, error } = useGetProrabPlanPeriodsQuery(projectId)

  const errorStatus = (error as any)?.status

  const getStatusBadge = (status: string) => {
    const isOpen = status === 'open'
    return (
      <span
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: isOpen ? '#198754' : '#6c757d',
          color: 'white',
          fontSize: '12px',
        }}
      >
        {isOpen ? t('prorab.planPeriods.statusOpen') : t('prorab.planPeriods.statusClosed')}
      </span>
    )
  }

  if (error) {
    if (errorStatus === 401) {
      return (
        <div className="prorab-plan-periods-page">
          <div className="error">
            <p>{t('prorab.error401')}</p>
            <Button onClick={() => navigate('/login')}>
              {t('auth.signIn')}
            </Button>
          </div>
        </div>
      )
    }
    
    if (errorStatus === 403) {
      return (
        <div className="prorab-plan-periods-page">
          <div className="error">
            <p>{t('prorab.error403')}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="prorab-plan-periods-page">
        <div className="error">
          <p>{getErrorMessage(error)}</p>
        </div>
      </div>
    )
  }

  const columns = [
    { key: 'period', label: t('prorab.planPeriods.columns.period') },
    { key: 'status', label: t('prorab.planPeriods.columns.status') },
    { key: 'limit_amount', label: t('prorab.planPeriods.columns.limitAmount') },
    { key: 'actions', label: t('prorab.planPeriods.columns.actions') },
  ]

  const tableData = data?.results.map((period) => ({
    ...period,
    status: getStatusBadge(period.status),
    limit_amount: period.limit_amount 
      ? `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(period.limit_amount))} сом`
      : '-',
    actions: period.status === 'open' ? (
      <Button
        size="small"
        onClick={() => navigate(`/prorab/projects/${projectId}/budget/${period.id}`)}
      >
        {t('prorab.planPeriods.buttons.enterPlan')}
      </Button>
    ) : (
      <span>-</span>
    ),
  })) || []

  return (
    <div className="prorab-plan-periods-page">
      <div className="page-header">
        <h2>{t('prorab.planPeriods.title')}</h2>
        <Button onClick={() => navigate('/prorab/projects')}>
          {t('prorab.planPeriods.buttons.backToProjects')}
        </Button>
      </div>
      
      {isLoading ? (
        <div className="loading">{t('prorab.planPeriods.loading')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('prorab.planPeriods.empty')}</p>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

export default ProrabPlanPeriodsPage




