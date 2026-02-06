import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGetProrabProjectsQuery } from '@/shared/api/prorabApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './ProrabProjectsPage.css'

/**
 * Format assigned date as dd.MM.yyyy or return "—" if invalid/missing.
 */
const formatAssignedDate = (date: string | null | undefined): string => {
  if (!date) return '—'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return '—'
    // Format as dd.MM.yyyy
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}.${month}.${year}`
  } catch {
    return '—'
  }
}

function ProrabProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data, isLoading, error } = useGetProrabProjectsQuery()

  const errorStatus = (error as any)?.status

  if (error) {
    if (errorStatus === 401) {
      return (
        <div className="prorab-projects-page">
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
        <div className="prorab-projects-page">
          <div className="error">
            <p>{t('prorab.error403')}</p>
          </div>
        </div>
      )
    }

    return (
      <div className="prorab-projects-page">
        <div className="error">
          <p>{getErrorMessage(error)}</p>
        </div>
      </div>
    )
  }

  const columns = [
    { key: 'name', label: t('prorab.projects.columns.project') },
    { key: 'assigned_at', label: t('prorab.projects.columns.assignedAt') },
    { key: 'actions', label: t('prorab.projects.columns.actions') },
  ]

  const tableData = data?.results.map((project) => {
    // Log assigned_at for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log('Project assigned_at:', project.assigned_at)
    }
    
    return {
      ...project,
      assigned_at: formatAssignedDate(project.assigned_at),
      actions: (
        <Button
          size="small"
          onClick={() => navigate(`/prorab/projects/${project.id}/plan-periods`)}
        >
          {t('prorab.projects.buttons.viewPeriods')}
        </Button>
      ),
    }
  }) || []

  return (
    <div className="prorab-projects-page">
      <div className="page-header">
        <h2>{t('prorab.projects.title')}</h2>
      </div>
      
      {isLoading ? (
        <div className="loading">{t('prorab.projects.loading')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('prorab.projects.empty')}</p>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}

export default ProrabProjectsPage


