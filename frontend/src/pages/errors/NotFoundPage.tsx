import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import './ErrorPage.css'

function NotFoundPage() {
  const { t } = useTranslation()
  
  return (
    <div className="error-page">
      <div className="error-content">
        <h1>404</h1>
        <h2>{t('errors.pageNotFound')}</h2>
        <p>{t('errors.notFound')}</p>
        <Link to="/">
          <Button>{t('common.goToHome')}</Button>
        </Link>
      </div>
    </div>
  )
}

export default NotFoundPage



