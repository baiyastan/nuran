import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './axiosBaseQuery'

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Auth', 'Users', 'Projects', 'Plan', 'PlanPeriods', 'PlanItems', 'ActualItems', 'ActualExpenses', 'Budget', 'BudgetList', 'ExpenseCategories', 'FinancePeriods', 'FinancePeriodSummary', 'IncomeEntries', 'IncomePlans', 'IncomeSources', 'MonthPeriods', 'Expenses', 'Report'],
  endpoints: () => ({}),
})

