import { useState } from 'react'
import { useSubmitPlanPeriodMutation } from '@/shared/api/planPeriodsApi'
import { Button } from '@/shared/ui/Button/Button'

interface SubmitPlanPeriodButtonProps {
  planPeriodId: number
}

export function SubmitPlanPeriodButton({ planPeriodId }: SubmitPlanPeriodButtonProps) {
  const [submitPlanPeriod, { isLoading }] = useSubmitPlanPeriodMutation()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!window.confirm('Are you sure you want to submit this plan period for approval?')) {
      return
    }

    setError(null)
    try {
      await submitPlanPeriod(planPeriodId).unwrap()
    } catch (err: any) {
      setError(err.data?.detail || err.message || 'Failed to submit plan period')
    }
  }

  return (
    <div>
      {error && <div style={{ color: 'red', marginBottom: '8px' }}>{error}</div>}
      <Button
        onClick={handleSubmit}
        disabled={isLoading}
        variant="primary"
      >
        {isLoading ? 'Submitting...' : 'Submit for Approval'}
      </Button>
    </div>
  )
}

