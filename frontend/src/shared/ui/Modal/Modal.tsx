import { useEffect, useRef } from 'react'
import './Modal.css'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  closeOnBackdropClick?: boolean
}

export function Modal({ isOpen, onClose, title, children, closeOnBackdropClick = true }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const firstFocusableRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    // Focus first input when modal opens
    const timer = setTimeout(() => {
      const firstInput = modalRef.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        'input, textarea'
      )
      if (firstInput) {
        firstInput.focus()
        firstFocusableRef.current = firstInput
      }
    }, 100)

    // Handle Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden'

    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-card" ref={modalRef}>
        {title && (
          <div className="modal-header">
            <h3 className="modal-title">{title}</h3>
          </div>
        )}
        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  )
}

