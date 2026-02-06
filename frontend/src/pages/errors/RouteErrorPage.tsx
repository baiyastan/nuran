import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/shared/ui/Button/Button'
import { getErrorMessage } from '@/shared/lib/utils'
import './ErrorPage.css'

function RouteErrorPage() {
  const { t } = useTranslation()
  const error = useRouteError()

  let errorMessage = t('errors.unexpected')
  let errorStatus = 500

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status
    // Safely extract error message - error.data?.message could be an object
    errorMessage = error.statusText || getErrorMessage(error.data) || errorMessage
  } else {
    // Use helper to safely convert any error to string
    errorMessage = getErrorMessage(error)
  }

  return (
    <div className="error-page">
      <div className="error-content">
        <h1>{errorStatus}</h1>
        <h2>{t('errors.somethingWentWrong')}</h2>
        <p>{errorMessage}</p>
        {process.env.NODE_ENV === 'development' && error instanceof Error && (
          <pre className="error-stack">{error.stack}</pre>
        )}
        <Link to="/">
          <Button>{t('common.goToHome')}</Button>
        </Link>
      </div>
    </div>
  )
}

export default RouteErrorPage



