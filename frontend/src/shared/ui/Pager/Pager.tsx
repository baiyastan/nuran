import { useTranslation } from 'react-i18next'
import './Pager.css'

interface PagerProps {
  page: number
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}

export function Pager({ page, hasPrev, hasNext, onPrev, onNext }: PagerProps) {
  const { t } = useTranslation('reports')
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <button
        type="button"
        className="pager__button"
        disabled={!hasPrev}
        onClick={onPrev}
      >
        <span className="pager__icon" aria-hidden="true">‹</span>
        <span>{t('pager.prev', { defaultValue: 'Назад' })}</span>
      </button>
      <span className="pager__indicator">
        {t('pager.page', { defaultValue: 'Стр.' })} <strong>{page}</strong>
      </span>
      <button
        type="button"
        className="pager__button"
        disabled={!hasNext}
        onClick={onNext}
      >
        <span>{t('pager.next', { defaultValue: 'Вперёд' })}</span>
        <span className="pager__icon" aria-hidden="true">›</span>
      </button>
    </div>
  )
}
