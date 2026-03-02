import { useTranslation } from 'react-i18next'
import { useListProjectsQuery } from '@/shared/api/projectsApi'
import './ProjectSelector.css'

interface ProjectSelectorProps {
  value: number | null
  onChange: (projectId: number | null) => void
  required?: boolean
}

export function ProjectSelector({ value, onChange, required = false }: ProjectSelectorProps) {
  const { t } = useTranslation('reports')
  const { data: projectsData, isLoading } = useListProjectsQuery({})

  const projects = projectsData?.results || []

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const projectId = e.target.value ? parseInt(e.target.value, 10) : null
    onChange(projectId)
  }

  if (isLoading) {
    return <div className="project-selector-loading">{t('filters.loadingProjects')}</div>
  }

  return (
    <div className="project-selector">
      <label htmlFor="project-selector">
        {t('filters.project')}: {required && <span className="required">*</span>}
      </label>
      <select
        id="project-selector"
        value={value || ''}
        onChange={handleChange}
        className="project-select"
        required={required}
      >
        <option value="">{t('filters.selectProject')}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
    </div>
  )
}

