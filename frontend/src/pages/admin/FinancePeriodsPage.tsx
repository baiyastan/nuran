import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useListFinancePeriodsQuery, useCreateFinancePeriodMutation } from '@/shared/api/financePeriodsApi'
import { useGetMonthPeriodQuery } from '@/shared/api/monthPeriodsApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { useToastContext } from '@/shared/ui/Toast/ToastProvider'
import { Button } from '@/shared/ui/Button/Button'
import { MonthGateCard } from '@/features/month-gate/MonthGateCard'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import { formatMoneyKGS } from '@/shared/utils/formatMoney'
import { FinancePeriod } from '@/entities/finance-period/model'
import './FinancePeriodsPage.css'
import '@/shared/ui/Table/Table.css'

interface FinancePeriodRow {
  id: number
  month_period_month: string
  fund_kind: string
  project_name: string
  income_total: string
  status: JSX.Element
  created_at: string
}

function FinancePeriodsPage() {
  const { t } = useTranslation('financePeriods')
  const { t: tCommon } = useTranslation('common')
  const navigate = useNavigate()
  const { role } = useAuth()
  const { showError, showSuccess } = useToastContext()
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return new Date().toISOString().slice(0, 7) // YYYY-MM format
  })

  // Parse selectedMonth (YYYY-MM format) to year and month integers
  const { year, month } = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-')
    return {
      year: parseInt(yearStr, 10),
      month: parseInt(monthStr, 10),
    }
  }, [selectedMonth])

  // Fetch finance periods for selected month
  const { data: financePeriodsData, isLoading, error } = useListFinancePeriodsQuery({
    year,
    month,
    fund_kind: 'office',
  })

  // Fetch month period
  const { data: monthPeriod } = useGetMonthPeriodQuery(selectedMonth)

  // Create finance period mutation
  const [createFinancePeriod, { isLoading: isCreatingFinancePeriod }] = useCreateFinancePeriodMutation()

  const financePeriods = useMemo(() => {
    if (!financePeriodsData) return []
    return Array.isArray(financePeriodsData) ? financePeriodsData : (financePeriodsData.results || [])
  }, [financePeriodsData])

  // Check if admin can create office finance period
  const canCreateOfficePeriod =
    role === 'admin' &&
    monthPeriod?.status === 'OPEN' &&
    financePeriods.length === 0

  // Handler to create office finance period
  const handleCreateOfficePeriod = async () => {
    if (!monthPeriod) {
      showError(t('createOfficePeriod.noMonth'))
      return
    }
    try {
      await createFinancePeriod({ month_period: monthPeriod.id, fund_kind: 'office' }).unwrap()
      showSuccess(t('createOfficePeriod.success'))
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      showError(msg || t('createOfficePeriod.error'))
    }
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    const colors: Record<string, string> = {
      open: '#198754',
      locked: '#dc3545',
      closed: '#6c757d',
    }
    return (
      <span
        style={{
          padding: '4px 8px',
          borderRadius: '4px',
          backgroundColor: colors[statusLower] || '#6c757d',
          color: 'white',
          fontSize: '12px',
          fontWeight: '500',
        }}
      >
        {t(`statuses.${statusLower}`) || status.toUpperCase()}
      </span>
    )
  }

  const columns: { key: keyof FinancePeriodRow; label: string }[] = [
    { key: 'month_period_month', label: t('columns.month') },
    { key: 'fund_kind', label: t('columns.fundKind') },
    { key: 'project_name', label: t('columns.project') },
    { key: 'income_total', label: t('columns.incomeTotal') },
    { key: 'status', label: t('columns.status') },
    { key: 'created_at', label: t('columns.createdAt') },
  ]

  const tableData: FinancePeriodRow[] = financePeriods.map((fp: FinancePeriod) => ({
    id: fp.id,
    month_period_month: fp.month_period_month,
    fund_kind: t(`fundKind.${fp.fund_kind}`),
    project_name: fp.project_name || '-',
    income_total: formatMoneyKGS(fp.income_total || '0'),
    status: getStatusBadge(fp.status),
    created_at: formatDate(fp.created_at),
  }))

  return (
    <div className="finance-periods-page">
      <div className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="help-text">{t('helpText')}</p>
        </div>
      </div>

      {/* Month Selector */}
      <div className="month-selector">
        <label htmlFor="month-select" className="month-selector__label">
          {t('month')}
        </label>
        <input
          id="month-select"
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="month-selector__input"
        />
      </div>

      {/* Month Gate Card */}
      <MonthGateCard selectedMonth={selectedMonth} />

      {/* Finance Periods List */}
      <div className="finance-periods-list">
        <h2>{t('list.title')}</h2>
        {isLoading ? (
          <div className="loading">{tCommon('loading')}</div>
        ) : error ? (
          <div className="error">{t('loadError')}</div>
        ) : financePeriods.length === 0 ? (
          <div className="empty-state">
            <p>{t('empty.title')}</p>
            {canCreateOfficePeriod && (
              <div className="finance-periods-empty-actions">
                <Button onClick={handleCreateOfficePeriod} disabled={isCreatingFinancePeriod}>
                  {isCreatingFinancePeriod
                    ? t('createOfficePeriod.creating')
                    : t('createOfficePeriod.button')}
                </Button>
              </div>
            )}
            {role === 'admin' && monthPeriod?.status !== 'OPEN' && (
              <p className="finance-periods-hint">
                {t('createOfficePeriod.needOpen')}
              </p>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate(`/finance-periods/${row.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {columns.map((column) => (
                      <td key={column.key}>{row[column.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default FinancePeriodsPage
