/**
 * Map i18n language code to Intl locale for month/year formatting.
 * - ru -> ru-RU
 * - ky -> ru-RU (fallback; Intl may not support ky-KG, avoid English)
 * - default -> en-US
 */
export function getLocaleFromI18n(lang: string): string {
  const normalized = (lang || '').split('-')[0].toLowerCase()
  if (normalized === 'ru') return 'ru-RU'
  if (normalized === 'ky') return 'ru-RU'
  return 'en-US'
}

/**
 * Format YYYY-MM as human-readable month label (e.g. "Февраль 2026" for ru-RU).
 * Uses Intl.DateTimeFormat with the given locale.
 */
export function formatMonthLabel(monthYYYYMM: string, locale: string): string {
  if (!monthYYYYMM || monthYYYYMM.length < 7) return monthYYYYMM
  const [y, m] = monthYYYYMM.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthYYYYMM
  const date = new Date(y, m - 1, 1)
  const resolvedLocale = getLocaleFromI18n(locale)
  return new Intl.DateTimeFormat(resolvedLocale, {
    month: 'long',
    year: 'numeric',
  }).format(date)
}
