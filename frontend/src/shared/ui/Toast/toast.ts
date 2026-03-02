/**
 * Global toast API. Must be bound from ToastProvider via bindToast() so that
 * calls work outside React tree (e.g. in callbacks, utilities).
 */

type ToastType = 'success' | 'error' | 'info' | 'warning'

type ShowToastFn = (message: string, type?: ToastType) => string
type ShowOneFn = (message: string) => string

const noop = (): string => ''

let showToastRef: ShowToastFn = noop
let showSuccessRef: ShowOneFn = noop
let showErrorRef: ShowOneFn = noop
let showWarningRef: ShowOneFn = noop
let showInfoRef: ShowOneFn = noop

export function bindToast(fns: {
  showToast: ShowToastFn
  showSuccess: ShowOneFn
  showError: ShowOneFn
  showWarning: ShowOneFn
  showInfo: ShowOneFn
}) {
  showToastRef = fns.showToast
  showSuccessRef = fns.showSuccess
  showErrorRef = fns.showError
  showWarningRef = fns.showWarning
  showInfoRef = fns.showInfo
}

export const toast = {
  showToast: (message: string, type?: ToastType) => showToastRef(message, type),
  showSuccess: (message: string) => showSuccessRef(message),
  showError: (message: string) => showErrorRef(message),
  showWarning: (message: string) => showWarningRef(message),
  showInfo: (message: string) => showInfoRef(message),
  success: (message: string) => showSuccessRef(message),
  error: (message: string) => showErrorRef(message),
  warning: (message: string) => showWarningRef(message),
  info: (message: string) => showInfoRef(message),
}
