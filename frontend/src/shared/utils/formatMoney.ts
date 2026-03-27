import { formatKGS } from '@/shared/lib/utils'

/**
 * Format amount as Kyrgyz som (KGS).
 * Delegates to the global formatKGS for consistent integer display and " сом" suffix.
 *
 * @param amount - Amount as number or string
 * @returns Formatted string with space-separated thousands and " сом" suffix
 */
export function formatMoneyKGS(amount: number | string): string {
  return formatKGS(amount)
}

/**
 * Display-only amount formatter for editable/readable numeric fields.
 * - empty input => empty string
 * - number-like input => Number(...).toString() (removes trailing .00)
 * - invalid input => original trimmed value
 */
export function formatAmountDisplayValue(value: number | string | null | undefined): string {
  if (value == null) return ''
  const raw = String(value).trim()
  if (!raw) return ''

  const normalized = raw.replace(/\s/g, '').replace(',', '.')
  const num = Number(normalized)
  if (!Number.isFinite(num)) return raw

  return num.toString()
}

