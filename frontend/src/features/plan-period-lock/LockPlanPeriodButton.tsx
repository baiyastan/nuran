import { useState } from 'react'
import { useLockPlanPeriodMutation } from '@/shared/api/planPeriodsApi'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'

interface LockPlanPeriodButtonProps {
  planPeriodId: number
}

export function LockPlanPeriodButton({ planPeriodId }: LockPlanPeriodButtonProps) {
  const [lockPlanPeriod, { isLoading }] = useLockPlanPeriodMutation()
  const [error, setError] = useState<string | null>(null)

  const handleLock = async () => {
    if (!window.confirm('Are you sure you want to lock this plan period? This action cannot be undone.')) {
      return
    }

    setError(null)
    try {
      await lockPlanPeriod(planPeriodId).unwrap()
    } catch (err: unknown) {
      setError(getErrorMessage(err) || 'Failed to lock plan period')
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'red', marginBottom: '8px' }}>{error}</div>}
      <Button
        onClick={handleLock}
        disabled={isLoading}
        variant="danger"
      >
        {isLoading ? 'Locking...' : 'Lock Period'}
      </Button>
    </div>
  )
}

