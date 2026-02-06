import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import kyTranslations from './resources/ky'
import ruTranslations from './resources/ru'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ky: {
        translation: kyTranslations,
      },
      ru: {
        translation: ruTranslations,
      },
    },
    fallbackLng: 'ky',
    supportedLngs: ['ky', 'ru'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    react: {
      useSuspense: false,
    },
  })

export default i18n



