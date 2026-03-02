import { createContext, useContext, useEffect, ReactNode } from 'react'
import { useToast } from '@/shared/hooks/useToast'
import { bindToast } from '@/shared/ui/Toast/toast'
import { ToastContainer } from './ToastContainer'

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => string
  showSuccess: (message: string) => string
  showError: (message: string) => string
  showWarning: (message: string) => string
  showInfo: (message: string) => string
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, showSuccess, showError, showWarning, showInfo, removeToast } = useToast()

  useEffect(() => {
    bindToast({ showToast, showSuccess, showError, showWarning, showInfo })
  }, [showToast, showSuccess, showError, showWarning, showInfo])

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToastContext() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider')
  }
  return context
}









