import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import kyTranslations from './resources/ky'
import ruTranslations from './resources/ru'

// Extract namespaces from translations
const kyCommon = kyTranslations.common || {}
const ruCommon = ruTranslations.common || {}

const kyFinancePeriods = kyTranslations.financePeriods || {}
const ruFinancePeriods = ruTranslations.financePeriods || {}

const kyIncomeEntries = kyTranslations.incomeEntries || {}
const ruIncomeEntries = ruTranslations.incomeEntries || {}

const kyFinancePeriodDetails = kyTranslations.financePeriodDetails || {}
const ruFinancePeriodDetails = ruTranslations.financePeriodDetails || {}

const kyReports = kyTranslations.reports || {}
const ruReports = ruTranslations.reports || {}

const kyPlanSetup = kyTranslations.planSetup || {}
const ruPlanSetup = ruTranslations.planSetup || {}

const kyMonthManagement = kyTranslations.monthManagement || {}
const ruMonthManagement = ruTranslations.monthManagement || {}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ky: {
        translation: kyTranslations,
        common: kyCommon,
        financePeriods: kyFinancePeriods,
        incomeEntries: kyIncomeEntries,
        financePeriodDetails: kyFinancePeriodDetails,
        reports: kyReports,
        planSetup: kyPlanSetup,
        monthManagement: kyMonthManagement,
      },
      ru: {
        translation: ruTranslations,
        common: ruCommon,
        financePeriods: ruFinancePeriods,
        incomeEntries: ruIncomeEntries,
        financePeriodDetails: ruFinancePeriodDetails,
        reports: ruReports,
        planSetup: ruPlanSetup,
        monthManagement: ruMonthManagement,
      },
    },
    defaultNS: 'translation',
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



