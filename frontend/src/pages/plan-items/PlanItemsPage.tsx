import { useState } from 'react'
import {
  useListPlanItemsQuery,
  useDeletePlanItemMutation,
  PlanItemListParams,
} from '@/shared/api/planItemsApi'
import { useListPlansQuery } from '@/shared/api/plansApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { TableSkeleton } from '@/components/ui/TableSkeleton'
import { CreatePlanItemForm } from '@/features/plan-item-create/CreatePlanItemForm'
import { PlanItemFilters } from '@/features/plan-item-filters/PlanItemFilters'
import { ApprovePlanItemButton } from '@/features/plan-item-approve/ApprovePlanItemButton'
import { formatDate, formatCurrency } from '@/shared/lib/utils'
import { PlanItem } from '@/entities/plan-item/model'
import './PlanItemsPage.css'

export function PlanItemsPage() {
  const { role } = useAuth()
  const [filters, setFilters] = useState<PlanItemListParams>({})
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  
  const { data, isLoading, error } = useListPlanItemsQuery(filters)
  const { data: plansData } = useListPlansQuery()
  const [deletePlanItem] = useDeletePlanItemMutation()

  const columns = [
    { key: 'name', label: 'Name' },
    { key: 'plan_name', label: 'Plan' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'unit', label: 'Unit' },
    { key: 'material', label: 'Material' },
    { key: 'cost', label: 'Cost' },
    { key: 'date', label: 'Date' },
    { key: 'status', label: 'Status' },
    { key: 'approval_stage', label: 'Approval Stage' },
    { key: 'created_by_username', label: 'Created By' },
    { key: 'actions', label: 'Actions' },
  ]

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this plan item?')) {
      try {
        await deletePlanItem(id).unwrap()
      } catch (error) {
        console.error('Delete failed:', error)
      }
    }
  }

  const tableData = data?.results.map((item: PlanItem) => ({
    ...item,
    cost: formatCurrency(item.cost ?? 0),
    date: formatDate(item.date ?? item.created_at),
    created_at: formatDate(item.created_at),
    actions: (
      <div className="actions">
        {role === 'foreman' ? null : (
          <>
            {(role === 'director' || role === 'admin') && (
              <ApprovePlanItemButton planItem={item} />
            )}
            {role === 'admin' && (
              <Button
                variant="danger"
                size="small"
                onClick={() => handleDelete(item.id)}
              >
                Delete
              </Button>
            )}
          </>
        )}
      </div>
    ),
  })) || []

  const plans = plansData?.results || []
  const canCreate = role === 'foreman' || role === 'director' || role === 'admin'

  return (
    <div className="plan-items-page">
      <div className="page-header">
        <h2>Plan Items</h2>
        {canCreate && (
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Plan Item'}
          </Button>
        )}
      </div>
      
      {showCreateForm && canCreate && (
        <div className="create-form-container">
          {selectedPlanId ? (
            <CreatePlanItemForm
              planPeriodId={selectedPlanId}
              onSuccess={() => {
                setShowCreateForm(false)
                setSelectedPlanId(null)
              }}
            />
          ) : (
            <div className="select-plan">
              <h3>Select a Plan</h3>
              <select
                onChange={(e) => setSelectedPlanId(parseInt(e.target.value))}
                value={selectedPlanId || ''}
              >
                <option value="">Choose a plan...</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.project_name})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
      
      <PlanItemFilters
        filters={filters}
        onChange={setFilters}
      />
      
      {isLoading ? (
        <TableSkeleton columnCount={11} />
      ) : error ? (
        <div>Error loading plan items</div>
      ) : (
        <Table columns={columns} data={tableData} />
      )}
    </div>
  )
}
