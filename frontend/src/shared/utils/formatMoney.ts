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

