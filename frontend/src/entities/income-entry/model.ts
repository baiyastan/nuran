export interface IncomeEntry {
  id: number
  finance_period: number
  finance_period_fund_kind: string
  finance_period_month: string
  project_name: string | null
  source?: {
    id: number
    name: string
  } | null
  source_id?: number | null
  account: 'CASH' | 'BANK'
  currency: 'KGS' | 'USD'
  amount: string
  received_at: string
  comment: string
  created_by: number
  created_by_username: string
  created_at: string
  updated_at: string
}

