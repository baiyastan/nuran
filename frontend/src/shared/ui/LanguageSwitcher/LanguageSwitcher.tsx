import { useTranslation } from 'react-i18next'
import './LanguageSwitcher.css'

function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng)
  }

  const currentLang = i18n.language || 'ky'

  return (
    <div className="language-switcher">
      <button
        className={`lang-btn ${currentLang === 'ky' ? 'active' : ''}`}
        onClick={() => changeLanguage('ky')}
        type="button"
      >
        KY
      </button>
      <span className="lang-separator">|</span>
      <button
        className={`lang-btn ${currentLang === 'ru' ? 'active' : ''}`}
        onClick={() => changeLanguage('ru')}
        type="button"
      >
        RU
      </button>
    </div>
  )
}

export default LanguageSwitcher



