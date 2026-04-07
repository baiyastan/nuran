import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'

export interface UseMonthPeriodIdResult {
  periodId: number | null
  isLoading: boolean
  error: unknown
  monthPeriod: {
    id: number
    month: string
    status: 'OPEN' | 'LOCKED'
    planning_open: boolean
    planning_opened_at: string | null
    planning_closed_at: string | null
  } | null
}

export function useMonthPeriodId(month: string | null | undefined): UseMonthPeriodIdResult {
  const { data: monthPeriod, isLoading, error } = useGetMonthPeriodQuery(month || '', {
    skip: !month,
  })

  return {
    periodId: monthPeriod?.id ?? null,
    isLoading,
    error: error || (month && !isLoading && !monthPeriod ? new Error(`Month period not found for ${month}`) : null),
    monthPeriod: monthPeriod || null,
  }
}
