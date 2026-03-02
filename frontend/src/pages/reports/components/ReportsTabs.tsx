import { useTranslation } from 'react-i18next'
import { ReportTab } from '../types/reports.types'
import './ReportsTabs.css'

const ALL_TABS: { id: ReportTab; labelKey: string }[] = [
  { id: 'office', labelKey: 'tabs.office' },
  { id: 'project', labelKey: 'tabs.project' },
  { id: 'charity', labelKey: 'tabs.charity' },
  { id: 'income', labelKey: 'tabs.income' },
]

interface ReportsTabsProps {
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
  allowedTabs: ReportTab[]
}

export function ReportsTabs({ activeTab, onTabChange, allowedTabs }: ReportsTabsProps) {
  const { t } = useTranslation('reports')
  const tabs = ALL_TABS.filter((tab) => allowedTabs.includes(tab.id))

  return (
    <div className="reports-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  )
}

