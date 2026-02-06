import { useApprovePlanItemMutation } from '@/shared/api/planItemsApi'
import { Button } from '@/shared/ui/Button/Button'
import { PlanItem } from '@/entities/plan-item/model'

interface ApprovePlanItemButtonProps {
  planItem: PlanItem
}

export function ApprovePlanItemButton({ planItem }: ApprovePlanItemButtonProps) {
  const [approvePlanItem, { isLoading }] = useApprovePlanItemMutation()

  const canApprove = () => {
    if (planItem.status === 'approved') return false
    if (planItem.approval_stage === 'foreman') return true
    if (planItem.approval_stage === 'director') return true
    return false
  }

  const handleApprove = async () => {
    try {
      await approvePlanItem(planItem.id).unwrap()
    } catch (error) {
      console.error('Approve failed:', error)
    }
  }

  if (!canApprove()) {
    return null
  }

  return (
    <Button
      onClick={handleApprove}
      disabled={isLoading}
      size="small"
    >
      {isLoading ? 'Approving...' : 'Approve'}
    </Button>
  )
}
