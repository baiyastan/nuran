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

export function formatKGS(value: number | string): string {
  const numValue = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(numValue)) return '0,00 сом'
  return `${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numValue)} сом`
}

export function debounce<T extends (...args: any[]) => any>(
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
    const err = error as any
    
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
    if (err.data) {
      if (typeof err.data === 'string') {
        return err.data
      }
      if (typeof err.data === 'object') {
        if (typeof err.data.message === 'string' && err.data.message) {
          return err.data.message
        }
        if (typeof err.data.detail === 'string' && err.data.detail) {
          return err.data.detail
        }
        if (typeof err.data.error === 'string' && err.data.error) {
          return err.data.error
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

