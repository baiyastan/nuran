import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useListIncomeSourcesQuery,
  useDeleteIncomeSourceMutation,
  IncomeSource,
} from '@/shared/api/incomeSourcesApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { CreateIncomeSourceModal } from '@/features/income-source-create/CreateIncomeSourceModal'
import { EditIncomeSourceModal } from '@/features/income-source-edit/EditIncomeSourceModal'
import './IncomeSourcesPage.css'

function IncomeSourcesPage() {
  const { t } = useTranslation()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null)

  // Fetch all sources (active + inactive) by passing empty string or omitting is_active
  const { data, isLoading, error } = useListIncomeSourcesQuery({ is_active: '' })
  const [deleteIncomeSource, { isLoading: isDeleting }] = useDeleteIncomeSourceMutation()

  const handleDelete = async (id: number) => {
    if (window.confirm(t('incomeSources.deleteConfirm'))) {
      try {
        await deleteIncomeSource(id).unwrap()
      } catch (error) {
        console.error('Delete failed:', error)
      }
    }
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
  }

  const handleEditSuccess = () => {
    setEditingSource(null)
  }

  const columns = [
    { key: 'name', label: t('incomeSources.columns.name') },
    { key: 'is_active', label: t('incomeSources.columns.isActive') },
    { key: 'actions', label: t('incomeSources.columns.actions') },
  ]

  const tableData =
    data?.results.map((source) => ({
      ...source,
      is_active: source.is_active ? (
        <span style={{ color: '#198754' }}>{t('status.OPEN', { ns: 'common' })}</span>
      ) : (
        <span style={{ color: '#dc3545' }}>{t('status.CLOSED', { ns: 'common' })}</span>
      ),
      actions: (
        <div className="actions">
          <Button
            size="small"
            variant="secondary"
            onClick={() => setEditingSource(source)}
          >
            {t('common.edit')}
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => handleDelete(source.id)}
            disabled={isDeleting}
          >
            {t('common.delete')}
          </Button>
        </div>
      ),
    })) || []

  return (
    <div className="income-sources-page">
      <div className="page-header">
        <h2>{t('incomeSources.title')}</h2>
        <Button onClick={() => setShowCreateModal(true)}>
          {t('incomeSources.create')}
        </Button>
      </div>

      {isLoading ? (
        <div className="loading">{t('incomeSources.loading')}</div>
      ) : error ? (
        <div className="error">{t('incomeSources.error')}</div>
      ) : !data?.results.length ? (
        <div className="empty-state">
          <p>{t('incomeSources.noSources')}</p>
        </div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}

      <CreateIncomeSourceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      <EditIncomeSourceModal
        isOpen={!!editingSource}
        onClose={() => setEditingSource(null)}
        source={editingSource}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}

export default IncomeSourcesPage

