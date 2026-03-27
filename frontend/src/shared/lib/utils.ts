export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}

export function formatKGS(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(numValue)) return '—'
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(numValue) + ' сом'
}

/** Format raw numeric string for display in amount inputs (space as thousand separator). */
export function formatAmountInputDisplay(raw: string): string {
  if (!raw || !raw.trim()) return ''
  const normalized = raw.trim().replace(/\s/g, '')
  const parts = normalized.split('.')
  const intPart = parts[0].replace(/\D/g, '') || '0'
  const decPart = parts[1] != null ? '.' + parts[1].replace(/\D/g, '').slice(0, 2) : ''
  const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return formatted + decPart
}

/** Parse display string (with spaces) back to raw numeric string for state/API. */
export function parseAmountInputInput(display: string): string {
  const normalized = display.replace(/\s/g, '').replace(',', '.')
  const match = normalized.match(/^(\d*)(\.?\d{0,2})?/)
  if (!match) return ''
  const intPart = match[1] || ''
  const decPart = match[2] ?? ''
  if (decPart === '.') return intPart || ''
  return intPart + decPart
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null
      func(...args)
    }

    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * Safely converts any error to a string message.
 * Handles Error instances, API error objects, and unknown types.
 * Never returns an object - always returns a string.
 */
export function getErrorMessage(error: unknown): string {
  // Handle null/undefined
  if (error == null) {
    return 'An unknown error occurred'
  }

  // Handle Error instances
  if (error instanceof Error) {
    return error.message || 'An error occurred'
  }

  // Handle string errors
  if (typeof error === 'string') {
    return error
  }

  // Handle API error objects (Axios/RTK Query format)
  if (typeof error === 'object') {
    const err = error as Record<string, unknown>

    // Try common error message fields
    if (typeof err.message === 'string' && err.message) {
      return err.message
    }

    if (typeof err.detail === 'string' && err.detail) {
      return err.detail
    }

    if (typeof err.error === 'string' && err.error) {
      return err.error
    }

    // Handle nested data object (common in API responses)
    const data = err.data
    if (data !== undefined && data !== null) {
      if (typeof data === 'string') {
        return data
      }
      if (typeof data === 'object') {
        const dataObj = data as Record<string, unknown>
        if (typeof dataObj.message === 'string' && dataObj.message) {
          return dataObj.message
        }
        if (typeof dataObj.detail === 'string' && dataObj.detail) {
          return dataObj.detail
        }
        if (typeof dataObj.error === 'string' && dataObj.error) {
          return dataObj.error
        }
      }
    }

    // Handle statusText
    if (typeof err.statusText === 'string' && err.statusText) {
      return err.statusText
    }
  }

  // Fallback: convert to string safely
  try {
    const stringified = String(error)
    // If stringification produces "[object Object]", try JSON
    if (stringified === '[object Object]') {
      try {
        return JSON.stringify(error)
      } catch {
        return 'An error occurred'
      }
    }
    return stringified
  } catch {
    return 'An error occurred'
  }
}

const CATEGORY_CREATE_ERROR_KEYS: Record<string, string> = {
  'Категория с таким названием уже существует у выбранного родителя.': 'categories.errors.duplicate',
  'Root categories are system-defined and cannot be created manually.': 'categories.errors.rootForbidden',
  'Name is required.': 'categories.errors.nameRequired',
}

function pickFirstMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
  }
  return null
}

export function getCreateCategoryErrorMessage(error: unknown): { translationKey?: string; message?: string } {
  const err = (error ?? {}) as Record<string, unknown>
  const data = (err.data ?? {}) as Record<string, unknown>

  const backendMessage =
    pickFirstMessage(data.name) ??
    pickFirstMessage(data.parent) ??
    pickFirstMessage(data.detail) ??
    null

  if (!backendMessage) return {}

  const translationKey = CATEGORY_CREATE_ERROR_KEYS[backendMessage]
  if (translationKey) {
    return { translationKey }
  }
  return { message: backendMessage }
}
