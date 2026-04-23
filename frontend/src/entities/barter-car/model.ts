export type Currency = 'KGS' | 'USD'
export type BarterCarStatus = 'RECEIVED' | 'SOLD'

export interface BarterCar {
  id: number
  brand: string
  model: string
  year: number
  plate_number: string
  vin: string
  color: string
  mileage_km: number | null
  has_tech_passport: boolean
  received_by_dover: boolean
  received_from_name: string
  received_from_phone: string
  apartment_ref: string
  agreed_value: string
  agreed_currency: Currency
  received_at: string
  status: BarterCarStatus
  sold_price: string | null
  sold_currency: Currency | null
  sold_to_name: string
  sold_to_phone: string
  sold_at: string | null
  notes: string
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: number | null
  margin: string | null
}

export interface BarterCarCreateInput {
  brand: string
  model: string
  year: number
  plate_number?: string
  vin?: string
  color?: string
  mileage_km?: number | null
  has_tech_passport: boolean
  received_by_dover: boolean
  received_from_name: string
  received_from_phone?: string
  apartment_ref?: string
  agreed_value: string
  agreed_currency: Currency
  received_at: string
  notes?: string
}

export type BarterCarEditInput = Partial<BarterCarCreateInput>

export interface BarterCarMarkSoldInput {
  sold_price: string
  sold_currency: Currency
  sold_at: string
  sold_to_name: string
  sold_to_phone?: string
  notes?: string
}

export interface BarterCarStats {
  received_total: number
  sold_total: number
  in_stock: number
  margin: Record<
    Currency,
    {
      sold_count: number
      agreed_sum: string
      sold_sum: string
      margin: string
    }
  >
}
