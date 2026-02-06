import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGetPlanPeriodQuery } from '@/shared/api/planPeriodsApi'

/**
 * Redirect component to deprecate old plan route.
 * Fetches PlanPeriod by periodId and redirects to new budgeting page.
 */
function ProrabPlanRedirect() {
  const { periodId } = useParams<{ periodId: string }>()
  const navigate = useNavigate()
  const periodIdNum = periodId ? parseInt(periodId, 10) : 0
  
  const { data: planPeriod, isLoading } = useGetPlanPeriodQuery(periodIdNum)

  useEffect(() => {
    if (!isLoading && planPeriod) {
      // Redirect to new budgeting page with projectId and periodId
      navigate(`/prorab/projects/${planPeriod.project}/budget/${periodIdNum}`, { replace: true })
    }
  }, [planPeriod, isLoading, periodIdNum, navigate])

  // Show loading while fetching
  return <div>Redirecting...</div>
}

export default ProrabPlanRedirect


