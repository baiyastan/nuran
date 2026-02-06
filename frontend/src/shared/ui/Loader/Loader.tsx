import { useTranslation } from 'react-i18next'
import './Loader.css'

function Loader() {
  const { t } = useTranslation()
  
  return (
    <div className="loader-container">
      <div className="loader-spinner"></div>
      <p className="loader-text">{t('common.loading')}</p>
    </div>
  )
}

export default Loader

