import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import kyTranslations from './resources/ky'
import ruTranslations from './resources/ru'

// Extract namespaces from translations
const kyCommon = kyTranslations.common || {}
const ruCommon = ruTranslations.common || {}

const kyTransfers = kyTranslations.transfers || {}
const ruTransfers = ruTranslations.transfers || {}

const kyFinancePeriods = kyTranslations.financePeriods || {}
const ruFinancePeriods = ruTranslations.financePeriods || {}

const kyIncomeEntries = kyTranslations.incomeEntries || {}
const ruIncomeEntries = ruTranslations.incomeEntries || {}

const kyFinancePeriodDetailsSource = kyTranslations.financePeriodDetails || {}
const ruFinancePeriodDetailsSource = ruTranslations.financePeriodDetails || {}

// Alias so fully-qualified keys resolve when ns=financePeriodDetails:
// - financePeriodDetails.* (e.g. financePeriodDetails.summary.plannedTotal)
// - common.* (e.g. common.back)
const kyFinancePeriodDetails = {
  ...kyFinancePeriodDetailsSource,
  financePeriodDetails: kyFinancePeriodDetailsSource,
  common: kyCommon,
}
const ruFinancePeriodDetails = {
  ...ruFinancePeriodDetailsSource,
  financePeriodDetails: ruFinancePeriodDetailsSource,
  common: ruCommon,
}

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
        transfers: kyTransfers,
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
        transfers: ruTransfers,
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

// Sanity check: confirm aliased paths exist under financePeriodDetails namespace (dev only)
if (import.meta.env?.DEV) {
  const check = (lng: 'ky' | 'ru') => {
    const ns = i18n.getResource(lng, 'financePeriodDetails', 'financePeriodDetails.summary.plannedTotal')
    const commonBack = i18n.getResource(lng, 'financePeriodDetails', 'common.back')
    const ok = typeof ns === 'string' && typeof commonBack === 'string'
    console.log(`[i18n] ${lng} financePeriodDetails aliases: ${ok ? 'OK' : 'MISSING'} (financePeriodDetails.summary.plannedTotal, common.back)`)
    return ok
  }
  i18n.on('initialized', () => {
    check('ky')
    check('ru')
  })
}

export default i18n



