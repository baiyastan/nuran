export interface CurrencyExchange {
  id: number
  source_account: 'CASH' | 'BANK'
  source_currency: 'KGS' | 'USD'
  source_amount: string
  destination_account: 'CASH' | 'BANK'
  destination_currency: 'KGS' | 'USD'
  destination_amount: string
  exchanged_at: string
  comment: string
  created_by: number | null
  created_by_username: string | null
  created_at: string
  updated_at: string
}
