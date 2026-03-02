import { useTranslation } from 'react-i18next'
import { formatMonthLabel } from '@/shared/lib/formatMonthLabel'
import './MonthSelector.css'

interface MonthSelectorProps {
  value: string // YYYY-MM format
  onChange: (month: string) => void
  monthStatus?: 'OPEN' | 'LOCKED' | null
}

export function MonthSelector({ value, onChange, monthStatus }: MonthSelectorProps) {
  const { t, i18n } = useTranslation('reports')
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const monthLabel = formatMonthLabel(value, locale)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  return (
    <div className="month-selector">
      <label htmlFor="month-selector">{t('filters.month')}:</label>
      <span className="month-selector-label" aria-hidden="true">
        {monthLabel}
      </span>
      <input
        id="month-selector"
        type="month"
        value={value}
        onChange={handleChange}
        className="month-input"
        aria-label={monthLabel}
      />
      {monthStatus && (
        <span className={`month-status-badge ${monthStatus.toLowerCase()}`}>
          {monthStatus === 'LOCKED' ? t('status.LOCKED') : monthStatus}
        </span>
      )}
    </div>
  )
}

