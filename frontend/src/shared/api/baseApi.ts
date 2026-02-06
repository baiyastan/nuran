import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './axiosBaseQuery'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Auth', 'Users', 'Projects', 'PlanPeriods', 'PlanItems', 'ActualItems', 'ActualExpenses', 'ProrabProjects', 'ProrabPlanPeriods', 'ProrabPlan', 'Budget', 'ExpenseCategories'],
  endpoints: () => ({}),
})

