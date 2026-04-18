export interface Transfer {
  id: number
  source_account: 'CASH' | 'BANK'
  destination_account: 'CASH' | 'BANK'
  currency: 'KGS' | 'USD'
  amount: string
  transferred_at: string
  comment: string
  created_by: number | null
  created_by_username: string | null
  created_at: string
  updated_at: string
}
