import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListProjectsQuery,
  ProjectListParams,
  Project,
  useDeleteProjectMutation,
} from '@/shared/api/projectsApi'
import { useGetForemenQuery } from '@/shared/api/usersApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { Modal } from '@/shared/ui/Modal/Modal'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { CreateProjectModal } from '@/features/project-create/CreateProjectModal'
import { EditProjectModal } from '@/features/project-edit/EditProjectModal'
import './ProjectsPage.css'

function ProjectsPage() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<ProjectListParams>({})
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null)
  const { data, isLoading, error } = useListProjectsQuery(filters)
  const { role } = useAuth()
  const { data: foremenData } = useGetForemenQuery()
  const [deleteProject, { isLoading: isDeleting }] = useDeleteProjectMutation()

  const canCreate = role === 'admin' || role === 'director'
  const canEdit = role === 'admin' || role === 'director'
  const canDelete = role === 'admin'

  // Create foreman map for quick lookup
  const foremanMap = useMemo(() => {
    const map: Record<number, { email: string }> = {}
    foremenData?.results.forEach((f) => {
      map[f.id] = { email: f.email }
    })
    return map
  }, [foremenData])

  const handleView = (projectId: number) => {
    // For now, just show project details in an alert or navigate to detail page
    // If detail page doesn't exist, we can show a simple info modal
    const project = data?.results.find((p) => p.id === projectId)
    if (project) {
      alert(`${t('projects.columns.name')}: ${project.name}\n${t('projects.columns.description')}: ${project.description || '-'}\n${t('projects.columns.status')}: ${project.status}`)
    }
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
  }

  const handleAssign = (project: Project) => {
    // Open edit modal with project pre-selected
    setEditingProject(project)
  }

  const handleDeleteClick = (projectId: number) => {
    setDeletingProjectId(projectId)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingProjectId) return

    try {
      await deleteProject(deletingProjectId).unwrap()
      alert(t('projects.deleteSuccess'))
      setDeletingProjectId(null)
    } catch (err: any) {
      const errorMessage = getErrorMessage(err)
      alert(errorMessage || t('projects.deleteError'))
    }
  }

  const handleDeleteCancel = () => {
    setDeletingProjectId(null)
  }

  const columns = [
    { key: 'name', label: t('projects.columns.name') },
    { key: 'description', label: t('projects.columns.description') },
    { key: 'status', label: t('projects.columns.status') },
    { key: 'assigned_foreman', label: t('projects.columns.assignedForeman') },
    { key: 'created_by_username', label: t('projects.columns.createdBy') },
    { key: 'created_at', label: t('projects.columns.createdAt') },
    ...(canEdit ? [{ key: 'actions', label: t('projects.columns.actions') }] : []),
  ]

  const tableData = useMemo(() => {
    if (!data?.results) return []

    // Deduplicate by id
    const uniqueProjects = new Map<number, Project>()
    data.results.forEach((p) => uniqueProjects.set(p.id, p))

    return Array.from(uniqueProjects.values()).map((project) => {
      const foreman = project.assigned_prorab_id
        ? foremanMap[project.assigned_prorab_id]
        : null

      return {
        ...project,
        assigned_foreman: foreman?.email || t('projects.notAssigned'),
        created_at: formatDate(project.created_at),
        actions: canEdit ? (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button size="small" onClick={() => handleView(project.id)}>
              {t('projects.actions.view')}
            </Button>
            <Button size="small" onClick={() => handleEdit(project)}>
              {t('projects.actions.edit')}
            </Button>
            <Button size="small" onClick={() => handleAssign(project)}>
              {t('projects.actions.assign')}
            </Button>
            {canDelete && (
              <Button
                size="small"
                variant="danger"
                onClick={() => handleDeleteClick(project.id)}
                disabled={isDeleting}
              >
                {t('projects.actions.delete')}
              </Button>
            )}
          </div>
        ) : null,
      }
    })
  }, [data, foremanMap, t, canEdit, canDelete, isDeleting])

  return (
    <div className="projects-page">
      <div className="page-header">
        <h2>{t('projects.title')}</h2>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)}>
            {t('projects.create')}
          </Button>
        )}
      </div>
      
      {isLoading ? (
        <div className="loading">{t('projects.loading')}</div>
      ) : error ? (
        <div className="error">{t('projects.loadError')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('projects.empty')}</p>
          {canCreate && (
            <Button onClick={() => setShowCreateModal(true)}>
              {t('projects.createFirst')}
            </Button>
          )}
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}

      {canCreate && (
        <CreateProjectModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
        />
      )}
      {canEdit && (
        <EditProjectModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          project={editingProject}
        />
      )}
      {canDelete && (
        <Modal
          isOpen={!!deletingProjectId}
          onClose={handleDeleteCancel}
          title={t('projects.deleteConfirm.title')}
          closeOnBackdropClick={false}
        >
          <div style={{ padding: '1rem 0' }}>
            <p>{t('projects.deleteConfirm.message')}</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
              >
                {t('projects.deleteConfirm.cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t('common.loading') : t('projects.deleteConfirm.confirm')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default ProjectsPage
