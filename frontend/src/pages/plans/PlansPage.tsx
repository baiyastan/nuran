import { useState } from 'react'
import {
  useListPlansQuery,
  useDeletePlanMutation,
  PlanListParams,
} from '@/shared/api/plansApi'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { formatDate } from '@/shared/lib/utils'
import './PlansPage.css'

export function PlansPage() {
  const [filters] = useState<PlanListParams>({})
  
  const { data, isLoading, error } = useListPlansQuery(filters)
  const [deletePlan] = useDeletePlanMutation()

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this plan?')) {
      try {
        await deletePlan(id).unwrap()
      } catch (error) {
        console.error('Delete failed:', error)
      }
    }
  }

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'project_name', label: 'Project' },
    { key: 'description', label: 'Description' },
    { key: 'status', label: 'Status' },
    { key: 'created_by_username', label: 'Created By' },
    { key: 'created_at', label: 'Created At' },
    { key: 'actions', label: 'Actions' },
  ]

  const tableData = data?.results.map((plan) => ({
    ...plan,
    created_at: formatDate(plan.created_at),
    actions: (
      <div className="actions">
        <Button
          variant="danger"
          size="small"
          onClick={() => handleDelete(plan.id)}
        >
          Delete
        </Button>
      </div>
    ),
  })) || []

  return (
    <div className="plans-page">
      <div className="page-header">
        <h2>Plans</h2>
      </div>
      
      {isLoading ? (
        <TableSkeleton columnCount={7} />
      ) : error ? (
        <div>Error loading plans</div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}
