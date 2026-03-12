import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import {
  useExportExpenseCategoryDetailPdfMutation,
  useExportIncomeSourceDetailPdfMutation,
  useGetDashboardExpenseCategoriesQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardKpiQuery,
  useExportSectionPdfMutation,
} from '@/shared/api/reportsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'
import { formatDate, formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface GlobalSummaryProps {
  month: string
}

type OpenPanel = 'income' | 'expense' | 'net' | 'balance' | null
type ExportSectionType = 'income_sources' | 'expense_categories'
type ExportDetailType = 'income_source_detail' | 'expense_category_detail'

function getDifferenceColor(type: 'income' | 'expense', diff: number): string {
  if (diff === 0) return 'diff-value diff-value--neutral'

  if (type === 'expense') {
    return diff > 0 ? 'diff-value diff-value--bad' : 'diff-value diff-value--good'
  }

  return diff > 0 ? 'diff-value diff-value--good' : 'diff-value diff-value--bad'
}

function formatSignedKGS(diff: number): string {
  if (diff === 0) {
    return formatKGS(0)
  }

  const abs = Math.abs(diff)
  const sign = diff > 0 ? '+' : '-'
  const formatted = formatKGS(abs)

  return `${sign}${formatted}`
}

function ChevronIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function getExportFilename(month: string, sectionType: ExportSectionType) {
  return `${month}_${sectionType}_report.pdf`
}

function getDetailExportFilename(
  month: string,
  detailType: ExportDetailType,
  targetId: number | null
) {
  const target = targetId === null ? 'uncategorized' : String(targetId)

  if (detailType === 'income_source_detail') {
    return `${month}_income_source_${target}_detail_report.pdf`
  }

  return `${month}_expense_category_${target}_detail_report.pdf`
}

function downloadBlob(blob: Blob, filename: string) {
  const downloadUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

export function GlobalSummary({ month }: GlobalSummaryProps) {
  const { t } = useTranslation('reports')
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [previousMonthOpen, setPreviousMonthOpen] = useState(false)
  const [exportSectionPdf] = useExportSectionPdfMutation()
  const [exportIncomeSourceDetailPdf] = useExportIncomeSourceDetailPdfMutation()
  const [exportExpenseCategoryDetailPdf] = useExportExpenseCategoryDetailPdfMutation()
  const [exportingSection, setExportingSection] = useState<ExportSectionType | null>(null)
  const [exportErrorSection, setExportErrorSection] = useState<ExportSectionType | null>(null)
  const [exportingDetail, setExportingDetail] = useState<ExportDetailType | null>(null)
  const [exportErrorDetail, setExportErrorDetail] = useState<ExportDetailType | null>(null)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<number | null | undefined>(undefined)
  const [selectedIncomeSourceName, setSelectedIncomeSourceName] = useState<string>('')
  const [incomeDetailPage, setIncomeDetailPage] = useState<number>(1)
  const [selectedExpenseCategoryId, setSelectedExpenseCategoryId] = useState<number | null | undefined>(undefined)
  const [selectedExpenseCategoryName, setSelectedExpenseCategoryName] = useState<string>('')
  const [expenseDetailPage, setExpenseDetailPage] = useState<number>(1)

  const {
    data: kpiData,
    isLoading: loadingKpi,
    error: kpiError,
  } = useGetDashboardKpiQuery({ month })

  const {
    data: expenseCategoriesData,
    isLoading: loadingExpenseCategories,
    error: expenseCategoriesError,
  } = useGetDashboardExpenseCategoriesQuery({ month })

  const {
    data: incomeSourcesData,
    isLoading: loadingIncomeSources,
    error: incomeSourcesError,
  } = useGetDashboardIncomeSourcesQuery({ month })

  const {
    data: incomeDetailsData,
    isLoading: loadingIncomeDetails,
    error: incomeDetailsError,
  } = useListIncomeEntriesQuery(
    selectedIncomeSourceId === undefined
      ? undefined
      : {
          month,
          source: selectedIncomeSourceId === null ? 'null' : selectedIncomeSourceId,
          page: incomeDetailPage,
        },
    {
      skip: selectedIncomeSourceId === undefined,
    }
  )

  const {
    data: expenseDetailsData,
    isLoading: loadingExpenseDetails,
    error: expenseDetailsError,
  } = useListActualExpensesQuery(
    selectedExpenseCategoryId === undefined
      ? undefined
      : {
          month,
          category: selectedExpenseCategoryId === null ? 'null' : selectedExpenseCategoryId,
          page: expenseDetailPage,
        },
    {
      skip: selectedExpenseCategoryId === undefined,
    }
  )

  const incomeActualTotal = kpiData ? parseFloat(kpiData.income_fact) : 0
  const expenseActualTotal = kpiData ? parseFloat(kpiData.expense_fact) : 0
  const net = kpiData ? parseFloat(kpiData.net) : 0
  const cashBalance = kpiData ? parseFloat(kpiData.cash_balance ?? '0') : 0
  const bankBalance = kpiData ? parseFloat(kpiData.bank_balance ?? '0') : 0
  const cashClosing = kpiData ? parseFloat(kpiData.cash_closing_balance ?? kpiData.cash_balance ?? '0') : 0
  const bankClosing = kpiData ? parseFloat(kpiData.bank_closing_balance ?? kpiData.bank_balance ?? '0') : 0
  const previousMonthCash = kpiData ? parseFloat(kpiData.cash_opening_balance ?? '0') : 0
  const previousMonthBank = kpiData ? parseFloat(kpiData.bank_opening_balance ?? '0') : 0

  const incomeBySource = useMemo(() => {
    if (!incomeSourcesData) return []

    const fallbackUncategorized = t('expense.tables.actual.uncategorized')

    return incomeSourcesData.rows.map((row) => ({
      source_id: row.source_id,
      source_name:
        row.source_name ||
        (row.source_id === null ? fallbackUncategorized : ''),
      plan: row.plan,
      fact: row.fact,
      diff: row.diff,
      count: row.count,
      sharePercent: row.sharePercent,
    }))
  }, [incomeSourcesData, t])

  const expenseByCategory = useMemo(() => {
    if (!expenseCategoriesData) return []

    const fallbackUncategorized = t('expense.tables.actual.uncategorized')

    return expenseCategoriesData.rows.map((row) => ({
      category_id: row.category_id,
      category_name:
        row.category_name ||
        (row.category_id === null ? fallbackUncategorized : ''),
      plan: row.plan,
      fact: row.fact,
      diff: row.diff,
      count: row.count,
      sharePercent: row.sharePercent,
    }))
  }, [expenseCategoriesData, t])

  const isLoading =
    loadingKpi ||
    loadingExpenseCategories ||
    loadingIncomeSources

  const hasError =
    kpiError || expenseCategoriesError || incomeSourcesError

  const handleSectionExport = async (sectionType: ExportSectionType) => {
    setExportErrorSection(null)
    setExportingSection(sectionType)

    try {
      const blob = await exportSectionPdf({ month, sectionType }).unwrap()
      downloadBlob(blob, getExportFilename(month, sectionType))
    } catch {
      setExportErrorSection(sectionType)
    } finally {
      setExportingSection(null)
    }
  }

  const handleIncomeDetailExport = async () => {
    if (selectedIncomeSourceId === undefined) {
      return
    }

    setExportErrorDetail(null)
    setExportingDetail('income_source_detail')

    try {
      const blob = await exportIncomeSourceDetailPdf({
        month,
        sourceId: selectedIncomeSourceId === null ? 'null' : selectedIncomeSourceId,
      }).unwrap()
      downloadBlob(
        blob,
        getDetailExportFilename(month, 'income_source_detail', selectedIncomeSourceId)
      )
    } catch {
      setExportErrorDetail('income_source_detail')
    } finally {
      setExportingDetail(null)
    }
  }

  const handleExpenseDetailExport = async () => {
    if (selectedExpenseCategoryId === undefined) {
      return
    }

    setExportErrorDetail(null)
    setExportingDetail('expense_category_detail')

    try {
      const blob = await exportExpenseCategoryDetailPdf({
        month,
        categoryId: selectedExpenseCategoryId === null ? 'null' : selectedExpenseCategoryId,
      }).unwrap()
      downloadBlob(
        blob,
        getDetailExportFilename(month, 'expense_category_detail', selectedExpenseCategoryId)
      )
    } catch {
      setExportErrorDetail('expense_category_detail')
    } finally {
      setExportingDetail(null)
    }
  }

  const renderSectionHeader = (title: string, sectionType: ExportSectionType) => (
    <div className="global-summary-section-header">
      <h4 className="global-summary-section-title">{title}</h4>
      <Button
        type="button"
        variant="secondary"
        size="small"
        className="global-summary-export-button"
        disabled={exportingSection !== null}
        title={t('globalSummary.actions.exportPdf')}
        aria-label={`${title} ${t('globalSummary.actions.exportPdf')}`}
        onClick={() => {
          void handleSectionExport(sectionType)
        }}
      >
        {exportingSection === sectionType
          ? t('globalSummary.actions.exportingPdf')
          : t('globalSummary.actions.exportPdf')}
      </Button>
    </div>
  )

  return (
    <div className="report-section global-summary-section">
      <h2>{t('globalSummary.title')}</h2>
      <div className="summary-card global-summary">
        <h3>{t('globalSummary.summaryTitle')}</h3>
        {isLoading && (
          <LoadingScreen compact title={t('loading')} description="" />
        )}
        {hasError && !isLoading && (
          <div className="summary-error">
            {t('errors.loadSummary')}
          </div>
        )}
        {!isLoading && !hasError && (
          <>
            <div className="summary-grid">
              <div className="summary-item">
                <span className="summary-label">{t('globalSummary.labels.incomeActual')}:</span>
                <span className="summary-value">{formatKGS(incomeActualTotal)}</span>
                <button
                  type="button"
                  className={`summary-kpi-chevron-button${
                    openPanel === 'income' ? ' summary-kpi-chevron-button--open' : ''
                  }`}
                  aria-label={t('globalSummary.actions.viewIncomeBreakdown')}
                  aria-expanded={openPanel === 'income'}
                  title={t('globalSummary.actions.viewIncomeBreakdown')}
                  onClick={() =>
                    setOpenPanel((current) => (current === 'income' ? null : 'income'))
                  }
                >
                  <ChevronIcon />
                </button>
              </div>
              <div className="summary-item">
                <span className="summary-label">{t('globalSummary.labels.expenseActual')}:</span>
                <span className="summary-value">
                  {formatKGS(expenseActualTotal)}
                </span>
                <button
                  type="button"
                  className={`summary-kpi-chevron-button${
                    openPanel === 'expense' ? ' summary-kpi-chevron-button--open' : ''
                  }`}
                  aria-label={t('globalSummary.actions.viewExpenseBreakdown')}
                  aria-expanded={openPanel === 'expense'}
                  title={t('globalSummary.actions.viewExpenseBreakdown')}
                  onClick={() =>
                    setOpenPanel((current) => (current === 'expense' ? null : 'expense'))
                  }
                >
                  <ChevronIcon />
                </button>
              </div>
              <div className="summary-item">
                <span className="summary-label">{t('globalSummary.labels.net')}:</span>
                <span
                  className={`summary-value ${
                    net >= 0 ? 'positive' : 'negative'
                  }`}
                >
                  {formatKGS(net)}
                </span>
                <button
                  type="button"
                  className={`summary-kpi-chevron-button${
                    openPanel === 'net' ? ' summary-kpi-chevron-button--open' : ''
                  }`}
                  aria-label={t('globalSummary.actions.viewNetBreakdown')}
                  aria-expanded={openPanel === 'net'}
                  title={t('globalSummary.actions.viewNetBreakdown')}
                  onClick={() =>
                    setOpenPanel((current) => (current === 'net' ? null : 'net'))
                  }
                >
                  <ChevronIcon />
                </button>
              </div>
            <div className="summary-item">
              <span className="summary-label">{t('globalSummary.labels.cashBalance')}:</span>
              <span className="summary-value">{formatKGS(cashBalance)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">{t('globalSummary.labels.bankBalance')}:</span>
              <span className="summary-value">{formatKGS(bankBalance)}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Общая сумма:</span>
              <span className="summary-value">{formatKGS(cashClosing + bankClosing)}</span>
              <button
                type="button"
                className={`summary-kpi-chevron-button${
                  openPanel === 'balance' ? ' summary-kpi-chevron-button--open' : ''
                }`}
                aria-label="Показать детализацию остатков по счетам"
                aria-expanded={openPanel === 'balance'}
                title="Показать детализацию остатков по счетам"
                onClick={() =>
                  setOpenPanel((current) => (current === 'balance' ? null : 'balance'))
                }
              >
                <ChevronIcon />
              </button>
            </div>
            </div>
            <div className="previous-month-block">
              <button
                type="button"
                className={`previous-month-block__header${previousMonthOpen ? ' previous-month-block__header--open' : ''}`}
                onClick={() => setPreviousMonthOpen((open) => !open)}
                aria-expanded={previousMonthOpen}
                aria-label={previousMonthOpen ? 'Свернуть' : 'Развернуть'}
              >
                <span className="previous-month-block__label">{t('globalSummary.previousMonthBalance')}</span>
                <span className="previous-month-block__chevron" aria-hidden>
                  <ChevronIcon />
                </span>
              </button>
              {previousMonthOpen && (
                <div className="previous-month-block__content">
                  <div>{t('globalSummary.labels.cashBalance')}: {formatKGS(previousMonthCash)}</div>
                  <div>{t('globalSummary.labels.bankBalance')}: {formatKGS(previousMonthBank)}</div>
                </div>
              )}
            </div>
          </>
        )}
        {openPanel === 'income' && !isLoading && !hasError && incomeBySource.length > 0 && (
          <div className="global-summary-breakdown">
            {renderSectionHeader(t('globalSummary.incomeSourcesSummaryTitle'), 'income_sources')}
            {exportErrorSection === 'income_sources' && (
              <div className="summary-error">
                {t('globalSummary.exportError')}
              </div>
            )}
            <Table
              columns={[
                { key: 'source_name', label: t('income.tables.actual.columns.sourceName') },
                { key: 'plan', label: t('income.labels.plan') },
                { key: 'fact', label: t('income.labels.actual') },
                { key: 'diff', label: t('income.labels.diff') },
                { key: 'count', label: t('count', { ns: 'common' }) },
                { key: 'sharePercent', label: t('income.labels.sharePercent') },
              ]}
              data={incomeBySource.map((row) => {
                const planNumber = parseFloat(row.plan)
                const factNumber = parseFloat(row.fact)
                const diff = factNumber - planNumber

                return {
                  source_name: (
                    <button
                      type="button"
                      className="summary-link-button"
                      onClick={() => {
                        setSelectedIncomeSourceId(row.source_id ?? null)
                        setSelectedIncomeSourceName(
                          row.source_name || t('expense.tables.actual.uncategorized')
                        )
                        setIncomeDetailPage(1)
                      }}
                    >
                      {row.source_name}
                    </button>
                  ),
                  plan: formatKGS(planNumber),
                  fact: formatKGS(factNumber),
                  diff: (
                    <span className={getDifferenceColor('income', diff)}>
                      {formatSignedKGS(diff)}
                    </span>
                  ),
                  count: row.count,
                  sharePercent:
                    row.sharePercent !== null ? `${row.sharePercent.toFixed(1)}%` : '—',
                }
              })}
            />
            {selectedIncomeSourceId !== undefined && (
              <div className="global-summary-expense-details">
                <div className="global-summary-section-header global-summary-section-header--detail">
                  <h4 className="expense-details-title">
                    {selectedIncomeSourceName} – {t('globalSummary.details')}
                  </h4>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    className="global-summary-export-button"
                    disabled={exportingDetail !== null}
                    title={t('globalSummary.actions.exportPdf')}
                    aria-label={`${selectedIncomeSourceName} ${t('globalSummary.actions.exportPdf')}`}
                    onClick={() => {
                      void handleIncomeDetailExport()
                    }}
                  >
                    {exportingDetail === 'income_source_detail'
                      ? t('globalSummary.actions.exportingPdf')
                      : t('globalSummary.actions.exportPdf')}
                  </Button>
                </div>
                {exportErrorDetail === 'income_source_detail' && (
                  <div className="summary-error">
                    {t('globalSummary.exportError')}
                  </div>
                )}

                {loadingIncomeDetails && (
                  <div className="summary-loading">
                    {t('loading')}
                  </div>
                )}

                {incomeDetailsError && !loadingIncomeDetails && (
                  <div className="summary-error">
                    {t('errors.loadDetails')}
                  </div>
                )}

                {!loadingIncomeDetails && !incomeDetailsError && (
                  <>
                    <div className="expense-details-summary">
                      <span>
                        {t('globalSummary.times')}: {incomeDetailsData?.total_count ?? incomeDetailsData?.count ?? 0}
                      </span>
                      <span>
                        {t('globalSummary.total')}{' '}
                        {formatKGS(incomeDetailsData?.total_amount ?? '0')}
                      </span>
                    </div>

                    {incomeDetailsData && incomeDetailsData.results.length > 0 ? (
                      <>
                        <Table
                          columns={[
                            { key: 'date', label: t('globalSummary.date') },
                            { key: 'vendor', label: t('globalSummary.vendor') },
                            { key: 'amount', label: t('globalSummary.amount') },
                            { key: 'comment', label: t('globalSummary.comment') },
                          ]}
                          data={incomeDetailsData.results.map((entry) => ({
                            date: formatDate(entry.received_at || entry.created_at),
                            vendor:
                              (entry.source && entry.source.name) ||
                              entry.created_by_username ||
                              '—',
                            amount: formatKGS(entry.amount),
                            comment: entry.comment || '—',
                          }))}
                        />
                        <div className="expense-details-pagination">
                          <button
                            type="button"
                            className="summary-kpi-link"
                            disabled={!incomeDetailsData.previous || incomeDetailPage <= 1}
                            onClick={() => setIncomeDetailPage((page) => Math.max(1, page - 1))}
                          >
                            {'<'}
                          </button>
                          <span className="expense-details-page-indicator">
                            {incomeDetailPage}
                          </span>
                          <button
                            type="button"
                            className="summary-kpi-link"
                            disabled={!incomeDetailsData.next}
                            onClick={() => setIncomeDetailPage((page) => page + 1)}
                          >
                            {'>'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="summary-no-data">
                        {t('globalSummary.noData')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {openPanel === 'expense' && expenseByCategory.length > 0 && (
          <div className="global-summary-breakdown">
            {renderSectionHeader(t('globalSummary.expenseCategoriesSummaryTitle'), 'expense_categories')}
            {exportErrorSection === 'expense_categories' && (
              <div className="summary-error">
                {t('globalSummary.exportError')}
              </div>
            )}
            <Table
              columns={[
                { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
                { key: 'plan', label: t('expense.labels.plan') },
                { key: 'fact', label: t('expense.labels.actual') },
                { key: 'diff', label: t('expense.labels.diff') },
                { key: 'count', label: t('count', { ns: 'common' }) },
                { key: 'sharePercent', label: t('expense.labels.sharePercent') },
              ]}
              data={expenseByCategory.map((row) => {
                const planNumber = parseFloat(row.plan)
                const factNumber = parseFloat(row.fact)
                const diff = factNumber - planNumber

                return {
                  category_name: (
                    <button
                      type="button"
                      className="summary-link-button"
                      onClick={() => {
                        setSelectedExpenseCategoryId(row.category_id ?? null)
                        setSelectedExpenseCategoryName(
                          row.category_name || t('expense.tables.actual.uncategorized')
                        )
                        setExpenseDetailPage(1)
                      }}
                    >
                      {row.category_name}
                    </button>
                  ),
                  plan: formatKGS(planNumber),
                  fact: formatKGS(factNumber),
                  diff: (
                    <span className={getDifferenceColor('expense', diff)}>
                      {formatSignedKGS(diff)}
                    </span>
                  ),
                  count: row.count,
                  sharePercent:
                    row.sharePercent !== null ? `${row.sharePercent.toFixed(1)}%` : '—',
                }
              })}
            />
            {selectedExpenseCategoryId !== undefined && (
              <div className="global-summary-expense-details">
                <div className="global-summary-section-header global-summary-section-header--detail">
                  <h4 className="expense-details-title">
                    {selectedExpenseCategoryName} – {t('globalSummary.details')}
                  </h4>
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    className="global-summary-export-button"
                    disabled={exportingDetail !== null}
                    title={t('globalSummary.actions.exportPdf')}
                    aria-label={`${selectedExpenseCategoryName} ${t('globalSummary.actions.exportPdf')}`}
                    onClick={() => {
                      void handleExpenseDetailExport()
                    }}
                  >
                    {exportingDetail === 'expense_category_detail'
                      ? t('globalSummary.actions.exportingPdf')
                      : t('globalSummary.actions.exportPdf')}
                  </Button>
                </div>
                {exportErrorDetail === 'expense_category_detail' && (
                  <div className="summary-error">
                    {t('globalSummary.exportError')}
                  </div>
                )}

                {loadingExpenseDetails && (
                  <div className="summary-loading">
                    {t('loading')}
                  </div>
                )}

                {expenseDetailsError && !loadingExpenseDetails && (
                  <div className="summary-error">
                    {t('errors.loadDetails')}
                  </div>
                )}

                {!loadingExpenseDetails && !expenseDetailsError && (
                  <>
                    <div className="expense-details-summary">
                      <span>
                        {t('globalSummary.times')}: {expenseDetailsData?.total_count ?? expenseDetailsData?.count ?? 0}
                      </span>
                      <span>
                        {t('globalSummary.total')}:{' '}
                        {formatKGS(expenseDetailsData?.total_amount ?? '0')}
                      </span>
                    </div>

                    {expenseDetailsData && expenseDetailsData.results.length > 0 ? (
                      <>
                        <Table
                          columns={[
                            { key: 'date', label: t('globalSummary.date') },
                            { key: 'vendor', label: t('globalSummary.vendor') },
                            { key: 'amount', label: t('globalSummary.amount') },
                            { key: 'comment', label: t('globalSummary.comment') },
                          ]}
                          data={expenseDetailsData.results.map((expense) => ({
                            date: formatDate(expense.spent_at),
                            vendor: expense.created_by_username || '—',
                            amount: formatKGS(expense.amount),
                            comment: expense.comment || '—',
                          }))}
                        />
                        <div className="expense-details-pagination">
                          <button
                            type="button"
                            className="summary-kpi-link"
                            disabled={!expenseDetailsData.previous || expenseDetailPage <= 1}
                            onClick={() => setExpenseDetailPage((page) => Math.max(1, page - 1))}
                          >
                            {'<'}
                          </button>
                          <span className="expense-details-page-indicator">
                            {expenseDetailPage}
                          </span>
                          <button
                            type="button"
                            className="summary-kpi-link"
                            disabled={!expenseDetailsData.next}
                            onClick={() => setExpenseDetailPage((page) => page + 1)}
                          >
                            {'>'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="summary-no-data">
                        {t('globalSummary.noData')}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
        {openPanel === 'net' && (
          <div className="global-summary-breakdown net-breakdown">
            <p>
              {t('globalSummary.netExplanation', {
                income: formatKGS(incomeActualTotal),
                expense: formatKGS(expenseActualTotal),
                net: formatKGS(net),
              })}
            </p>
          </div>
        )}
        {openPanel === 'balance' && (
          <div className="global-summary-breakdown balance-breakdown">
            <p>Касса: {formatKGS(cashClosing)}</p>
            <p>Банк: {formatKGS(bankClosing)}</p>
          </div>
        )}
      </div>
    </div>
  )
}

