import { useTranslation } from 'react-i18next'
import './LoadingScreen.css'

export interface LoadingScreenProps {
  /** Use compact layout (e.g. inside cards) */
  compact?: boolean
  /** Override title; defaults to common.loadingScreen.title */
  title?: string
  /** Override description; defaults to common.loadingScreen.description */
  description?: string
}

export function LoadingScreen({ compact = false, title, description }: LoadingScreenProps) {
  const { t } = useTranslation('common')
  const displayTitle = title ?? t('loadingScreen.title')
  const displayDescription = description ?? t('loadingScreen.description')

  return (
    <div
      className={`loading-screen${compact ? ' loading-screen--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={displayTitle}
    >
      <div
        className="loading-screen__spinner"
        aria-hidden="true"
      />
      <h2 className="loading-screen__title">{displayTitle}</h2>
      <p className="loading-screen__description">{displayDescription}</p>
    </div>
  )
}
