import { useState } from 'react'
import { useApprovePlanPeriodMutation } from '@/shared/api/planPeriodsApi'
import { Button } from '@/shared/ui/Button/Button'

interface ApprovePlanPeriodButtonProps {
  planPeriodId: number
}

export function ApprovePlanPeriodButton({ planPeriodId }: ApprovePlanPeriodButtonProps) {
  const [approvePlanPeriod, { isLoading }] = useApprovePlanPeriodMutation()
  const [error, setError] = useState<string | null>(null)
  const [comments, setComments] = useState('')
  const [showForm, setShowForm] = useState(false)

  const handleApprove = async () => {
    setError(null)
    try {
      await approvePlanPeriod({ id: planPeriodId, comments: comments || undefined }).unwrap()
      setShowForm(false)
      setComments('')
    } catch (err: any) {
      setError(err.data?.detail || err.message || 'Failed to approve plan period')
    }
  }

  const handleReject = async () => {
    if (!window.confirm('This will return the plan period to draft status. Continue?')) {
      return
    }
    // TODO: Implement reject/return to draft endpoint if needed
    // For now, we'll just show an error
    setError('Reject functionality not yet implemented')
  }

  if (!showForm) {
    return (
      <div>
        <Button onClick={() => setShowForm(true)} variant="success">
          Approve / Return
        </Button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <textarea
        placeholder="Comments (optional)"
        value={comments}
        onChange={(e) => setComments(e.target.value)}
        rows={3}
        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
      />
      <div style={{ display: 'flex', gap: '8px' }}>
        <Button
          onClick={handleApprove}
          disabled={isLoading}
          variant="success"
        >
          {isLoading ? 'Approving...' : 'Approve'}
        </Button>
        <Button
          onClick={handleReject}
          disabled={isLoading}
          variant="danger"
        >
          Return to Draft
        </Button>
        <Button
          onClick={() => {
            setShowForm(false)
            setComments('')
            setError(null)
          }}
          variant="secondary"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

