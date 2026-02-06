import { baseApi } from './baseApi'

export interface PlanVsActualParams {
  plan_period_id?: number
  project_id?: number
}

export interface PlanVsActualResponse {
  plan_total: number
  actual_total: number
  variance: number
  variance_percent: number
  status: 'over' | 'equal' | 'under'
  plan_period_id?: number
  project_id?: number
}

export const reportsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    planVsActual: builder.query<PlanVsActualResponse, PlanVsActualParams | void>({
      query: (params) => ({
        url: '/reports/plan-vs-actual/',
        params,
      }),
    }),
  }),
})

export const { usePlanVsActualQuery } = reportsApi

