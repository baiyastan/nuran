import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { Button } from '@/shared/ui/Button/Button'
import { LoadingScreen } from '@/components/ui/LoadingScreen'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import {
  useExportExpenseCategoryDetailPdfMutation,
  useExportCashMovementPdfMutation,
  useExportIncomeSourceDetailPdfMutation,
  useGetDashboardExpenseCategoriesQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardKpiQuery,
  useExportSectionPdfMutation,
  useGetTransferDetailsQuery,
} from '@/shared/api/reportsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'
import { useAuth } from '@/shared/hooks/useAuth'
import { formatDate, formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface GlobalSummaryProps {
  month: string
}

type OpenPanel = 'income' | 'expense' | 'balance' | null
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

function getExportFilename(
  month: string,
  sectionType: ExportSectionType,
  account: 'ALL' | 'CASH' | 'BANK'
) {
  return `${month}_${sectionType}_${account}_report.pdf`
}

function getDetailExportFilename(
  month: string,
  detailType: ExportDetailType,
  targetId: number | null,
  account: 'ALL' | 'CASH' | 'BANK'
) {
  const target = targetId === null ? 'uncategorized' : String(targetId)

  if (detailType === 'income_source_detail') {
    return `${month}_income_source_${target}_${account}_detail_report.pdf`
  }

  return `${month}_expense_category_${target}_${account}_detail_report.pdf`
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

function getCashMovementFilename(
  account: 'CASH' | 'BANK',
  startDate: string,
  endDate: string
) {
  return `cash_movement_${account.toLowerCase()}_${startDate}_${endDate}.pdf`
}

export function GlobalSummary({ month }: GlobalSummaryProps) {
  const { t } = useTranslation('reports')
  const { accessToken, role } = useAuth()
  const canExportPdf = role !== 'director'
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [exportSectionPdf] = useExportSectionPdfMutation()
  const [exportIncomeSourceDetailPdf] = useExportIncomeSourceDetailPdfMutation()
  const [exportExpenseCategoryDetailPdf] = useExportExpenseCategoryDetailPdfMutation()
  const [exportingSection, setExportingSection] = useState<ExportSectionType | null>(null)
  const [exportErrorSection, setExportErrorSection] = useState<ExportSectionType | null>(null)
  const [exportingDetail, setExportingDetail] = useState<ExportDetailType | null>(null)
  const [exportErrorDetail, setExportErrorDetail] = useState<ExportDetailType | null>(null)
  const [exportCashMovementPdf] = useExportCashMovementPdfMutation()
  const [cashMovementAccount, setCashMovementAccount] = useState<'CASH' | 'BANK'>('CASH')
  const [cashMovementStartDate, setCashMovementStartDate] = useState('')
  const [cashMovementEndDate, setCashMovementEndDate] = useState('')
  const [cashMovementExporting, setCashMovementExporting] = useState(false)
  const [cashMovementExportError, setCashMovementExportError] = useState(false)
  const [selectedIncomeSourceId, setSelectedIncomeSourceId] = useState<number | null | undefined>(undefined)
  const [selectedIncomeSourceName, setSelectedIncomeSourceName] = useState<string>('')
  const [incomeDetailPage, setIncomeDetailPage] = useState<number>(1)
  const [selectedExpenseCategoryId, setSelectedExpenseCategoryId] = useState<number | null | undefined>(undefined)
  const [selectedExpenseCategoryName, setSelectedExpenseCategoryName] = useState<string>('')
  const [expenseDetailPage, setExpenseDetailPage] = useState<number>(1)
  const [expenseAccountFilter, setExpenseAccountFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL')
  const [incomeAccountFilter, setIncomeAccountFilter] = useState<'ALL' | 'CASH' | 'BANK'>('ALL')
  const [detailRangeDraft, setDetailRangeDraft] = useState<{ start_date: string; end_date: string }>({
    start_date: '',
    end_date: '',
  })
  const [detailRangeApplied, setDetailRangeApplied] = useState<{ start_date: string; end_date: string } | null>(null)
  const [incomeDetailFilterDraft, setIncomeDetailFilterDraft] = useState<{
    start_date: string
    end_date: string
    account: 'ALL' | 'CASH' | 'BANK'
  } | null>(null)
  const [incomeDetailFilterApplied, setIncomeDetailFilterApplied] = useState<{
    start_date: string
    end_date: string
    account: 'ALL' | 'CASH' | 'BANK'
  } | null>(null)
  const [expenseDetailFilterDraft, setExpenseDetailFilterDraft] = useState<{
    start_date: string
    end_date: string
    account: 'ALL' | 'CASH' | 'BANK'
  } | null>(null)
  const [expenseDetailFilterApplied, setExpenseDetailFilterApplied] = useState<{
    start_date: string
    end_date: string
    account: 'ALL' | 'CASH' | 'BANK'
  } | null>(null)
  const [openTransferDirection, setOpenTransferDirection] = useState<'BANK_TO_CASH' | 'CASH_TO_BANK' | null>(null)
  const isRangePairFilled = Boolean(detailRangeDraft.start_date && detailRangeDraft.end_date)
  const isRangeInvalid = isRangePairFilled && detailRangeDraft.start_date > detailRangeDraft.end_date

  const incomeDetailEffectiveFilter = incomeDetailFilterApplied ?? {
    start_date: detailRangeApplied?.start_date ?? '',
    end_date: detailRangeApplied?.end_date ?? '',
    account: incomeAccountFilter,
  }
  const expenseDetailEffectiveFilter = expenseDetailFilterApplied ?? {
    start_date: detailRangeApplied?.start_date ?? '',
    end_date: detailRangeApplied?.end_date ?? '',
    account: expenseAccountFilter,
  }

  const {
    data: kpiData,
    isLoading: loadingKpi,
    error: kpiError,
  } = useGetDashboardKpiQuery({ month })

  const {
    data: expenseCategoriesData,
    isLoading: loadingExpenseCategories,
    error: expenseCategoriesError,
  } = useGetDashboardExpenseCategoriesQuery({
    month,
    ...(expenseAccountFilter !== 'ALL' && { account: expenseAccountFilter }),
    ...(detailRangeApplied && {
      start_date: detailRangeApplied.start_date,
      end_date: detailRangeApplied.end_date,
    }),
  })

  const {
    data: incomeSourcesData,
    isLoading: loadingIncomeSources,
    error: incomeSourcesError,
  } = useGetDashboardIncomeSourcesQuery({
    month,
    ...(incomeAccountFilter !== 'ALL' && { account: incomeAccountFilter }),
    ...(detailRangeApplied && {
      start_date: detailRangeApplied.start_date,
      end_date: detailRangeApplied.end_date,
    }),
  })

  const {
    data: incomeDetailsData,
    isLoading: loadingIncomeDetails,
    error: incomeDetailsError,
  } = useListIncomeEntriesQuery(
    selectedIncomeSourceId === undefined
      ? undefined
      : {
          month,
          ...(selectedIncomeSourceId !== null && { source: selectedIncomeSourceId }),
          page: incomeDetailPage,
          ...(incomeDetailEffectiveFilter.account !== 'ALL' && { account: incomeDetailEffectiveFilter.account }),
          ...(incomeDetailEffectiveFilter.start_date && incomeDetailEffectiveFilter.end_date && {
            start_date: incomeDetailEffectiveFilter.start_date,
            end_date: incomeDetailEffectiveFilter.end_date,
          }),
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
          ...(expenseDetailEffectiveFilter.account !== 'ALL' && { account: expenseDetailEffectiveFilter.account }),
          ...(expenseDetailEffectiveFilter.start_date && expenseDetailEffectiveFilter.end_date && {
            start_date: expenseDetailEffectiveFilter.start_date,
            end_date: expenseDetailEffectiveFilter.end_date,
          }),
        },
    {
      skip: selectedExpenseCategoryId === undefined,
    }
  )

  const {
    data: transferDetails,
    isLoading: loadingTransfers,
    error: transferError,
  } = useGetTransferDetailsQuery({ month })

  const incomeActualTotal = kpiData ? parseFloat(kpiData.income_fact) : 0
  const expenseActualTotal = kpiData ? parseFloat(kpiData.expense_fact) : 0
  const net = kpiData ? parseFloat(kpiData.net) : 0
  const cashBalance = kpiData ? parseFloat(kpiData.cash_balance ?? '0') : 0
  const bankBalance = kpiData ? parseFloat(kpiData.bank_balance ?? '0') : 0
  const cashClosing = kpiData
    ? parseFloat(kpiData.cash_closing_balance ?? kpiData.cash_balance ?? '0')
    : 0
  const bankClosing = kpiData
    ? parseFloat(kpiData.bank_closing_balance ?? kpiData.bank_balance ?? '0')
    : 0
  const previousMonthCash = kpiData ? parseFloat(kpiData.cash_opening_balance ?? '0') : 0
  const previousMonthBank = kpiData ? parseFloat(kpiData.bank_opening_balance ?? '0') : 0
  const bankToCashMonth = kpiData ? parseFloat(kpiData.bank_to_cash_month ?? '0') : 0
  const cashToBankMonth = kpiData ? parseFloat(kpiData.cash_to_bank_month ?? '0') : 0

  const totalClosingBalance = cashClosing + bankClosing
  const totalOpeningBalance = previousMonthCash + previousMonthBank
  const balanceChange = totalClosingBalance - totalOpeningBalance
  const cashMovementRangeInvalid =
    Boolean(cashMovementStartDate && cashMovementEndDate) &&
    cashMovementStartDate > cashMovementEndDate

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
      const sectionRange =
        detailRangeApplied?.start_date && detailRangeApplied?.end_date
          ? {
              start_date: detailRangeApplied.start_date,
              end_date: detailRangeApplied.end_date,
            }
          : {}
      const blob = await exportSectionPdf({
        month,
        sectionType,
        ...(sectionType === 'expense_categories' &&
          expenseAccountFilter !== 'ALL' && { account: expenseAccountFilter }),
        ...(sectionType === 'income_sources' &&
          incomeAccountFilter !== 'ALL' && { account: incomeAccountFilter }),
        ...sectionRange,
      }).unwrap()
      const accountForFilename =
        sectionType === 'expense_categories' ? expenseAccountFilter : incomeAccountFilter
      downloadBlob(blob, getExportFilename(month, sectionType, accountForFilename))
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
        ...(incomeDetailEffectiveFilter.account !== 'ALL' && { account: incomeDetailEffectiveFilter.account }),
        ...(incomeDetailEffectiveFilter.start_date && incomeDetailEffectiveFilter.end_date && {
          start_date: incomeDetailEffectiveFilter.start_date,
          end_date: incomeDetailEffectiveFilter.end_date,
        }),
      }).unwrap()
      downloadBlob(
        blob,
        getDetailExportFilename(
          month,
          'income_source_detail',
          selectedIncomeSourceId,
          incomeDetailEffectiveFilter.account
        )
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
        ...(expenseDetailEffectiveFilter.account !== 'ALL' && { account: expenseDetailEffectiveFilter.account }),
        ...(expenseDetailEffectiveFilter.start_date && expenseDetailEffectiveFilter.end_date && {
          start_date: expenseDetailEffectiveFilter.start_date,
          end_date: expenseDetailEffectiveFilter.end_date,
        }),
      }).unwrap()
      downloadBlob(
        blob,
        getDetailExportFilename(
          month,
          'expense_category_detail',
          selectedExpenseCategoryId,
          expenseDetailEffectiveFilter.account
        )
      )
    } catch {
      setExportErrorDetail('expense_category_detail')
    } finally {
      setExportingDetail(null)
    }
  }

  const applyDetailRange = () => {
    if (!isRangePairFilled || isRangeInvalid) {
      return
    }
    setDetailRangeApplied({
      start_date: detailRangeDraft.start_date,
      end_date: detailRangeDraft.end_date,
    })
    setIncomeDetailPage(1)
    setExpenseDetailPage(1)
    setSelectedIncomeSourceId(undefined)
    setSelectedExpenseCategoryId(undefined)
    setIncomeDetailFilterApplied(null)
    setIncomeDetailFilterDraft(null)
    setExpenseDetailFilterApplied(null)
    setExpenseDetailFilterDraft(null)
  }

  const resetDetailRange = () => {
    setDetailRangeDraft({ start_date: '', end_date: '' })
    setDetailRangeApplied(null)
    setIncomeDetailPage(1)
    setExpenseDetailPage(1)
    setSelectedIncomeSourceId(undefined)
    setSelectedExpenseCategoryId(undefined)
    setIncomeDetailFilterApplied(null)
    setIncomeDetailFilterDraft(null)
    setExpenseDetailFilterApplied(null)
    setExpenseDetailFilterDraft(null)
  }

  const handleCashMovementExport = async () => {
    if (!cashMovementStartDate || !cashMovementEndDate || cashMovementRangeInvalid) {
      return
    }
    setCashMovementExportError(false)
    setCashMovementExporting(true)
    try {
      const blob = await exportCashMovementPdf({
        account: cashMovementAccount,
        start_date: cashMovementStartDate,
        end_date: cashMovementEndDate,
      }).unwrap()
      downloadBlob(
        blob,
        getCashMovementFilename(cashMovementAccount, cashMovementStartDate, cashMovementEndDate)
      )
    } catch {
      setCashMovementExportError(true)
    } finally {
      setCashMovementExporting(false)
    }
  }

  const incomeDetailRangePairFilled = Boolean(
    incomeDetailFilterDraft?.start_date && incomeDetailFilterDraft?.end_date
  )
  const incomeDetailHasAnyDate = Boolean(
    incomeDetailFilterDraft?.start_date || incomeDetailFilterDraft?.end_date
  )
  const incomeDetailRangePairIncomplete = incomeDetailHasAnyDate && !incomeDetailRangePairFilled
  const incomeDetailRangeOrderInvalid = Boolean(
    incomeDetailRangePairFilled &&
      incomeDetailFilterDraft &&
      incomeDetailFilterDraft.start_date > incomeDetailFilterDraft.end_date
  )
  const incomeDetailOutOfParentRange = Boolean(
    incomeDetailRangePairFilled &&
      detailRangeApplied &&
      incomeDetailFilterDraft &&
      (incomeDetailFilterDraft.start_date < detailRangeApplied.start_date ||
        incomeDetailFilterDraft.end_date > detailRangeApplied.end_date)
  )
  const expenseDetailRangePairFilled = Boolean(
    expenseDetailFilterDraft?.start_date && expenseDetailFilterDraft?.end_date
  )
  const expenseDetailHasAnyDate = Boolean(
    expenseDetailFilterDraft?.start_date || expenseDetailFilterDraft?.end_date
  )
  const expenseDetailRangePairIncomplete = expenseDetailHasAnyDate && !expenseDetailRangePairFilled
  const expenseDetailRangeOrderInvalid = Boolean(
    expenseDetailRangePairFilled &&
      expenseDetailFilterDraft &&
      expenseDetailFilterDraft.start_date > expenseDetailFilterDraft.end_date
  )
  const expenseDetailOutOfParentRange = Boolean(
    expenseDetailRangePairFilled &&
      detailRangeApplied &&
      expenseDetailFilterDraft &&
      (expenseDetailFilterDraft.start_date < detailRangeApplied.start_date ||
        expenseDetailFilterDraft.end_date > detailRangeApplied.end_date)
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
                <span className="summary-label">
                  {t('globalSummary.labels.incomeActual')}:
                </span>
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
                <span
                  className="summary-value"
                  title="Факт расходов за месяц может включать плановые корректировки и расходы из разных модулей"
                >
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
                <span className="summary-label">{t('globalSummary.labels.cashBalance')}:</span>
                <span className="summary-value">{formatKGS(cashBalance)}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">{t('globalSummary.labels.bankBalance')}:</span>
                <span className="summary-value">{formatKGS(bankBalance)}</span>
              </div>
              <div className="summary-item">
                <span
                  className="summary-label"
                  title="Остаток на счетах (касса + банк) на конец месяца"
                >
                  Остаток на счетах:
                </span>
                <span className="summary-value">{formatKGS(totalClosingBalance)}</span>
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
            {canExportPdf && (
              <div className="global-summary-account-export-block">
                <h4 className="global-summary-balance-details__heading">Отчет по счёту</h4>
                <div className="detail-filter-toolbar">
                  <div className="detail-filter-toolbar__controls">
                    <label htmlFor="cash-movement-account" className="expense-categories-filter__label">
                      {t('cashMovement.account')}
                    </label>
                    <select
                      id="cash-movement-account"
                      className="expense-categories-filter__select"
                      value={cashMovementAccount}
                      onChange={(e) => setCashMovementAccount(e.target.value as 'CASH' | 'BANK')}
                    >
                      <option value="CASH">{t('globalSummary.expenseAccountCash')}</option>
                      <option value="BANK">{t('globalSummary.expenseAccountBank')}</option>
                    </select>
                    <label htmlFor="cash-movement-start" className="expense-categories-filter__label">
                      {t('filters.startDate')}
                    </label>
                    <input
                      id="cash-movement-start"
                      className="expense-categories-filter__select"
                      type="date"
                      value={cashMovementStartDate}
                      onChange={(e) => setCashMovementStartDate(e.target.value)}
                    />
                    <label htmlFor="cash-movement-end" className="expense-categories-filter__label">
                      {t('filters.endDate')}
                    </label>
                    <input
                      id="cash-movement-end"
                      className="expense-categories-filter__select"
                      type="date"
                      value={cashMovementEndDate}
                      onChange={(e) => setCashMovementEndDate(e.target.value)}
                    />
                    <Button
                      type="button"
                      size="small"
                      disabled={
                        cashMovementExporting ||
                        !cashMovementStartDate ||
                        !cashMovementEndDate ||
                        cashMovementRangeInvalid
                      }
                      onClick={() => {
                        void handleCashMovementExport()
                      }}
                    >
                      {cashMovementExporting ? t('globalSummary.actions.exportingPdf') : 'Скачать отчет по счёту'}
                    </Button>
                  </div>
                  <p className="detail-range-hint">
                    Экспортирует начальный остаток, доход, расход, transfer net и конечный остаток.
                  </p>
                  {cashMovementRangeInvalid && (
                    <div className="summary-error">{t('filters.invalidRange')}</div>
                  )}
                  {cashMovementExportError && (
                    <div className="summary-error">{t('globalSummary.exportError')}</div>
                  )}
                </div>
              </div>
            )}
            {/* helper text removed for compact summary */}
          </>
        )}
        {openPanel === 'income' && !isLoading && !hasError && incomeBySource.length > 0 && (
          <div className="global-summary-breakdown">
            <div className="global-summary-section-header">
              <h4 className="global-summary-section-title">
                {t('globalSummary.incomeSourcesSummaryTitle')}
              </h4>
              <div className="global-summary-section-header__actions">
                <div className="parent-filter-toolbar">
                  <div className="parent-filter-toolbar__label-row">
                    <span className="filter-level-badge filter-level-badge--parent">{t('filters.generalFilter')}</span>
                    {detailRangeApplied && (
                      <span className="detail-range-badge">
                        {t('filters.period')}: {detailRangeApplied.start_date} — {detailRangeApplied.end_date}
                      </span>
                    )}
                  </div>
                  <div className="parent-filter-toolbar__controls">
                    <div className="detail-range-filter">
                      <label className="expense-categories-filter__label" htmlFor="detail-range-start-income">
                        {t('filters.startDate')}
                      </label>
                      <input
                        id="detail-range-start-income"
                        className="expense-categories-filter__select"
                        type="date"
                        value={detailRangeDraft.start_date}
                        onChange={(e) =>
                          setDetailRangeDraft((current) => ({ ...current, start_date: e.target.value }))
                        }
                      />
                      <label className="expense-categories-filter__label" htmlFor="detail-range-end-income">
                        {t('filters.endDate')}
                      </label>
                      <input
                        id="detail-range-end-income"
                        className="expense-categories-filter__select"
                        type="date"
                        value={detailRangeDraft.end_date}
                        onChange={(e) =>
                          setDetailRangeDraft((current) => ({ ...current, end_date: e.target.value }))
                        }
                      />
                    </div>
                    <div className="expense-categories-filter expense-categories-filter--inline">
                      <label htmlFor="income-account-filter" className="expense-categories-filter__label">
                        {t('globalSummary.incomeAccountFilterLabel')}:
                      </label>
                      <select
                        id="income-account-filter"
                        className="expense-categories-filter__select"
                        value={incomeAccountFilter}
                        onChange={(e) => {
                          setIncomeAccountFilter(e.target.value as 'ALL' | 'CASH' | 'BANK')
                          setSelectedIncomeSourceId(undefined)
                          setIncomeDetailFilterApplied(null)
                          setIncomeDetailFilterDraft(null)
                          setIncomeDetailPage(1)
                        }}
                        aria-label={t('globalSummary.incomeAccountFilterLabel')}
                      >
                        <option value="ALL">{t('globalSummary.expenseAccountAll')}</option>
                        <option value="CASH">{t('globalSummary.expenseAccountCash')}</option>
                        <option value="BANK">{t('globalSummary.expenseAccountBank')}</option>
                      </select>
                    </div>
                    <Button type="button" size="small" onClick={applyDetailRange} disabled={!isRangePairFilled || isRangeInvalid}>
                      {t('filters.apply')}
                    </Button>
                    <Button type="button" variant="secondary" size="small" onClick={resetDetailRange}>
                      {t('filters.reset')}
                    </Button>
                    {canExportPdf && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        className="global-summary-export-button global-summary-export-button--muted"
                        disabled={exportingSection !== null}
                        title={t('globalSummary.actions.exportPdf')}
                        aria-label={`${t('globalSummary.incomeSourcesSummaryTitle')} ${t('globalSummary.actions.exportPdf')}`}
                        onClick={() => {
                          void handleSectionExport('income_sources')
                        }}
                      >
                        {exportingSection === 'income_sources'
                          ? t('globalSummary.actions.exportingPdf')
                          : t('globalSummary.actions.exportPdf')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {canExportPdf && exportErrorSection === 'income_sources' && (
              <div className="summary-error">
                {t('globalSummary.exportError')}
              </div>
            )}
            {isRangeInvalid && (
              <div className="summary-error">{t('filters.invalidRange')}</div>
            )}
            {detailRangeApplied && (
              <div className="detail-range-hint">{t('filters.monthPlanHint')}</div>
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
                        const initial = {
                          start_date: detailRangeApplied?.start_date ?? '',
                          end_date: detailRangeApplied?.end_date ?? '',
                          account: incomeAccountFilter,
                        } as const
                        setIncomeDetailFilterDraft(initial)
                        setIncomeDetailFilterApplied(null)
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
                  <div className="expense-details-title-block">
                    <h4 className="expense-details-title">
                      {selectedIncomeSourceName} – {t('globalSummary.details')}
                    </h4>
                    <p className="expense-details-meta">
                      {(incomeDetailsData?.total_count ?? incomeDetailsData?.count ?? 0)} {t('globalSummary.times')} ·{' '}
                      {t('globalSummary.total')} {formatKGS(incomeDetailsData?.total_amount ?? '0')}
                    </p>
                  </div>
                  <div className="global-summary-section-header__actions">
                    <div className="detail-filter-toolbar">
                      <div className="detail-filter-toolbar__label-row">
                        <span className="detail-filter-toolbar__title">{t('filters.detailFilter')}</span>
                        <span
                          className={
                            incomeDetailFilterApplied
                              ? 'filter-level-badge filter-level-badge--local'
                              : 'filter-level-badge filter-level-badge--parent'
                          }
                        >
                          {incomeDetailFilterApplied ? t('filters.localFilter') : t('filters.generalFilter')}
                        </span>
                      </div>
                      <div className="detail-filter-toolbar__controls">
                        <div className="detail-range-filter detail-range-filter--compact">
                          <label htmlFor="income-detail-start" className="expense-categories-filter__label">
                            {t('filters.startDate')}
                          </label>
                          <input
                            id="income-detail-start"
                            className="expense-categories-filter__select"
                            type="date"
                            value={incomeDetailFilterDraft?.start_date ?? ''}
                            onChange={(e) =>
                              setIncomeDetailFilterDraft((current) => ({
                                start_date: e.target.value,
                                end_date: current?.end_date ?? '',
                                account: current?.account ?? incomeAccountFilter,
                              }))
                            }
                          />
                          <label htmlFor="income-detail-end" className="expense-categories-filter__label">
                            {t('filters.endDate')}
                          </label>
                          <input
                            id="income-detail-end"
                            className="expense-categories-filter__select"
                            type="date"
                            value={incomeDetailFilterDraft?.end_date ?? ''}
                            onChange={(e) =>
                              setIncomeDetailFilterDraft((current) => ({
                                start_date: current?.start_date ?? '',
                                end_date: e.target.value,
                                account: current?.account ?? incomeAccountFilter,
                              }))
                            }
                          />
                          <label htmlFor="income-detail-account" className="expense-categories-filter__label">
                            {t('globalSummary.incomeAccountFilterLabel')}:
                          </label>
                          <select
                            id="income-detail-account"
                            className="expense-categories-filter__select"
                            value={incomeDetailFilterDraft?.account ?? incomeAccountFilter}
                            onChange={(e) =>
                              setIncomeDetailFilterDraft((current) => ({
                                start_date: current?.start_date ?? '',
                                end_date: current?.end_date ?? '',
                                account: e.target.value as 'ALL' | 'CASH' | 'BANK',
                              }))
                            }
                          >
                            <option value="ALL">{t('globalSummary.expenseAccountAll')}</option>
                            <option value="CASH">{t('globalSummary.expenseAccountCash')}</option>
                            <option value="BANK">{t('globalSummary.expenseAccountBank')}</option>
                          </select>
                        </div>
                        <Button
                          type="button"
                          size="small"
                          onClick={() => {
                            if (
                              !incomeDetailFilterDraft ||
                              incomeDetailRangePairIncomplete ||
                              incomeDetailRangeOrderInvalid ||
                              incomeDetailOutOfParentRange
                            ) {
                              return
                            }
                            setIncomeDetailFilterApplied(incomeDetailFilterDraft)
                            setIncomeDetailPage(1)
                          }}
                          disabled={
                            incomeDetailRangePairIncomplete ||
                            incomeDetailRangeOrderInvalid ||
                            incomeDetailOutOfParentRange
                          }
                        >
                          {t('filters.apply')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            const resetToParent = {
                              start_date: detailRangeApplied?.start_date ?? '',
                              end_date: detailRangeApplied?.end_date ?? '',
                              account: incomeAccountFilter,
                            } as const
                            setIncomeDetailFilterDraft(resetToParent)
                            setIncomeDetailFilterApplied(null)
                            setIncomeDetailPage(1)
                          }}
                        >
                          {t('filters.reset')}
                        </Button>
                        {incomeDetailFilterApplied && (
                          <span className="detail-range-badge">
                            {t('filters.detailPeriod')}: {incomeDetailFilterApplied.start_date} —{' '}
                            {incomeDetailFilterApplied.end_date}
                          </span>
                        )}
                        {canExportPdf && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="small"
                            className="global-summary-export-button global-summary-export-button--muted"
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
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {canExportPdf && exportErrorDetail === 'income_source_detail' && (
                  <div className="summary-error">
                    {t('globalSummary.exportError')}
                  </div>
                )}
                {incomeDetailRangeOrderInvalid && (
                  <div className="summary-error">{t('filters.invalidRange')}</div>
                )}
                {incomeDetailOutOfParentRange && (
                  <div className="summary-error">{t('filters.outOfParentRange')}</div>
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
                            { key: 'account', label: t('globalSummary.incomeAccountFilterLabel') },
                            { key: 'amount', label: t('globalSummary.amount') },
                            { key: 'comment', label: t('globalSummary.comment') },
                          ]}
                          data={incomeDetailsData.results.map((entry) => ({
                            date: formatDate(entry.received_at || entry.created_at),
                            vendor:
                              (entry.source && entry.source.name) ||
                              entry.created_by_username ||
                              '—',
                            account:
                              entry.account === 'CASH'
                                ? 'Касса'
                                : entry.account === 'BANK'
                                ? 'Банк'
                                : '—',
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
            <div className="global-summary-section-header">
              <h4 className="global-summary-section-title">
                {t('globalSummary.expenseCategoriesSummaryTitle')}
              </h4>
              <div className="global-summary-section-header__actions">
                <div className="parent-filter-toolbar">
                  <div className="parent-filter-toolbar__label-row">
                    <span className="filter-level-badge filter-level-badge--parent">{t('filters.generalFilter')}</span>
                    {detailRangeApplied && (
                      <span className="detail-range-badge">
                        {t('filters.period')}: {detailRangeApplied.start_date} — {detailRangeApplied.end_date}
                      </span>
                    )}
                  </div>
                  <div className="parent-filter-toolbar__controls">
                    <div className="detail-range-filter">
                      <label className="expense-categories-filter__label" htmlFor="detail-range-start-expense">
                        {t('filters.startDate')}
                      </label>
                      <input
                        id="detail-range-start-expense"
                        className="expense-categories-filter__select"
                        type="date"
                        value={detailRangeDraft.start_date}
                        onChange={(e) =>
                          setDetailRangeDraft((current) => ({ ...current, start_date: e.target.value }))
                        }
                      />
                      <label className="expense-categories-filter__label" htmlFor="detail-range-end-expense">
                        {t('filters.endDate')}
                      </label>
                      <input
                        id="detail-range-end-expense"
                        className="expense-categories-filter__select"
                        type="date"
                        value={detailRangeDraft.end_date}
                        onChange={(e) =>
                          setDetailRangeDraft((current) => ({ ...current, end_date: e.target.value }))
                        }
                      />
                    </div>
                    <div className="expense-categories-filter expense-categories-filter--inline">
                      <label htmlFor="expense-account-filter" className="expense-categories-filter__label">
                        {t('globalSummary.expenseAccountFilterLabel')}:
                      </label>
                      <select
                        id="expense-account-filter"
                        className="expense-categories-filter__select"
                        value={expenseAccountFilter}
                        onChange={(e) => {
                          setExpenseAccountFilter(e.target.value as 'ALL' | 'CASH' | 'BANK')
                          setSelectedExpenseCategoryId(undefined)
                          setExpenseDetailFilterApplied(null)
                          setExpenseDetailFilterDraft(null)
                          setExpenseDetailPage(1)
                        }}
                        aria-label={t('globalSummary.expenseAccountFilterLabel')}
                      >
                        <option value="ALL">{t('globalSummary.expenseAccountAll')}</option>
                        <option value="CASH">{t('globalSummary.expenseAccountCash')}</option>
                        <option value="BANK">{t('globalSummary.expenseAccountBank')}</option>
                      </select>
                    </div>
                    <Button type="button" size="small" onClick={applyDetailRange} disabled={!isRangePairFilled || isRangeInvalid}>
                      {t('filters.apply')}
                    </Button>
                    <Button type="button" variant="secondary" size="small" onClick={resetDetailRange}>
                      {t('filters.reset')}
                    </Button>
                    {canExportPdf && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="small"
                        className="global-summary-export-button global-summary-export-button--muted"
                        disabled={exportingSection !== null}
                        title={t('globalSummary.actions.exportCategoryPdf')}
                        aria-label={`${t('globalSummary.expenseCategoriesSummaryTitle')} ${t('globalSummary.actions.exportCategoryPdf')}`}
                        onClick={() => {
                          void handleSectionExport('expense_categories')
                        }}
                      >
                        {exportingSection === 'expense_categories'
                          ? t('globalSummary.actions.exportingPdf')
                          : t('globalSummary.actions.exportCategoryPdf')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            {canExportPdf && exportErrorSection === 'expense_categories' && (
              <div className="summary-error">
                {t('globalSummary.exportError')}
              </div>
            )}
            {isRangeInvalid && (
              <div className="summary-error">{t('filters.invalidRange')}</div>
            )}
            {detailRangeApplied && (
              <div className="detail-range-hint">{t('filters.monthPlanHint')}</div>
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
                        const initial = {
                          start_date: detailRangeApplied?.start_date ?? '',
                          end_date: detailRangeApplied?.end_date ?? '',
                          account: expenseAccountFilter,
                        } as const
                        setExpenseDetailFilterDraft(initial)
                        setExpenseDetailFilterApplied(null)
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
                  <div className="expense-details-title-block">
                    <h4 className="expense-details-title">
                      {selectedExpenseCategoryName} – {t('globalSummary.details')}
                    </h4>
                    <p className="expense-details-meta">
                      {(expenseDetailsData?.total_count ?? expenseDetailsData?.count ?? 0)} {t('globalSummary.times')} ·{' '}
                      {t('globalSummary.total')} {formatKGS(expenseDetailsData?.total_amount ?? '0')}
                    </p>
                  </div>
                  <div className="global-summary-section-header__actions">
                    <div className="detail-filter-toolbar">
                      <div className="detail-filter-toolbar__label-row">
                        <span className="detail-filter-toolbar__title">{t('filters.detailFilter')}</span>
                        <span
                          className={
                            expenseDetailFilterApplied
                              ? 'filter-level-badge filter-level-badge--local'
                              : 'filter-level-badge filter-level-badge--parent'
                          }
                        >
                          {expenseDetailFilterApplied ? t('filters.localFilter') : t('filters.generalFilter')}
                        </span>
                      </div>
                      <div className="detail-filter-toolbar__controls">
                        <div className="detail-range-filter detail-range-filter--compact">
                          <label htmlFor="expense-detail-start" className="expense-categories-filter__label">
                            {t('filters.startDate')}
                          </label>
                          <input
                            id="expense-detail-start"
                            className="expense-categories-filter__select"
                            type="date"
                            value={expenseDetailFilterDraft?.start_date ?? ''}
                            onChange={(e) =>
                              setExpenseDetailFilterDraft((current) => ({
                                start_date: e.target.value,
                                end_date: current?.end_date ?? '',
                                account: current?.account ?? expenseAccountFilter,
                              }))
                            }
                          />
                          <label htmlFor="expense-detail-end" className="expense-categories-filter__label">
                            {t('filters.endDate')}
                          </label>
                          <input
                            id="expense-detail-end"
                            className="expense-categories-filter__select"
                            type="date"
                            value={expenseDetailFilterDraft?.end_date ?? ''}
                            onChange={(e) =>
                              setExpenseDetailFilterDraft((current) => ({
                                start_date: current?.start_date ?? '',
                                end_date: e.target.value,
                                account: current?.account ?? expenseAccountFilter,
                              }))
                            }
                          />
                          <label htmlFor="expense-detail-account" className="expense-categories-filter__label">
                            {t('globalSummary.expenseAccountFilterLabel')}:
                          </label>
                          <select
                            id="expense-detail-account"
                            className="expense-categories-filter__select"
                            value={expenseDetailFilterDraft?.account ?? expenseAccountFilter}
                            onChange={(e) =>
                              setExpenseDetailFilterDraft((current) => ({
                                start_date: current?.start_date ?? '',
                                end_date: current?.end_date ?? '',
                                account: e.target.value as 'ALL' | 'CASH' | 'BANK',
                              }))
                            }
                          >
                            <option value="ALL">{t('globalSummary.expenseAccountAll')}</option>
                            <option value="CASH">{t('globalSummary.expenseAccountCash')}</option>
                            <option value="BANK">{t('globalSummary.expenseAccountBank')}</option>
                          </select>
                        </div>
                        <Button
                          type="button"
                          size="small"
                          onClick={() => {
                            if (
                              !expenseDetailFilterDraft ||
                              expenseDetailRangePairIncomplete ||
                              expenseDetailRangeOrderInvalid ||
                              expenseDetailOutOfParentRange
                            ) {
                              return
                            }
                            setExpenseDetailFilterApplied(expenseDetailFilterDraft)
                            setExpenseDetailPage(1)
                          }}
                          disabled={
                            expenseDetailRangePairIncomplete ||
                            expenseDetailRangeOrderInvalid ||
                            expenseDetailOutOfParentRange
                          }
                        >
                          {t('filters.apply')}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="small"
                          onClick={() => {
                            const resetToParent = {
                              start_date: detailRangeApplied?.start_date ?? '',
                              end_date: detailRangeApplied?.end_date ?? '',
                              account: expenseAccountFilter,
                            } as const
                            setExpenseDetailFilterDraft(resetToParent)
                            setExpenseDetailFilterApplied(null)
                            setExpenseDetailPage(1)
                          }}
                        >
                          {t('filters.reset')}
                        </Button>
                        {expenseDetailFilterApplied && (
                          <span className="detail-range-badge">
                            {t('filters.detailPeriod')}: {expenseDetailFilterApplied.start_date} —{' '}
                            {expenseDetailFilterApplied.end_date}
                          </span>
                        )}
                        {canExportPdf && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="small"
                            className="global-summary-export-button global-summary-export-button--muted"
                            disabled={exportingDetail !== null}
                            title={t('globalSummary.actions.exportCategoryPdf')}
                            aria-label={`${selectedExpenseCategoryName} ${t('globalSummary.actions.exportCategoryPdf')}`}
                            onClick={() => {
                              void handleExpenseDetailExport()
                            }}
                          >
                            {exportingDetail === 'expense_category_detail'
                              ? t('globalSummary.actions.exportingPdf')
                              : t('globalSummary.actions.exportCategoryPdf')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {canExportPdf && exportErrorDetail === 'expense_category_detail' && (
                  <div className="summary-error">
                    {t('globalSummary.exportError')}
                  </div>
                )}
                {expenseDetailRangeOrderInvalid && (
                  <div className="summary-error">{t('filters.invalidRange')}</div>
                )}
                {expenseDetailOutOfParentRange && (
                  <div className="summary-error">{t('filters.outOfParentRange')}</div>
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
                            { key: 'account', label: t('globalSummary.expenseAccountFilterLabel') },
                            { key: 'amount', label: t('globalSummary.amount') },
                            { key: 'comment', label: t('globalSummary.comment') },
                          ]}
                          data={expenseDetailsData.results.map((expense) => ({
                            date: formatDate(expense.spent_at),
                            vendor: expense.created_by_username || '—',
                            account:
                              expense.account === 'CASH'
                                ? 'Касса'
                                : expense.account === 'BANK'
                                ? 'Банк'
                                : '—',
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
        {openPanel === 'balance' && (
          <div className="global-summary-breakdown global-summary-balance-details">
            <h4 className="global-summary-balance-details__heading">Мурунку айдан остаток</h4>
            <p>
              Касса:{' '}
              <span className="global-summary-balance-details__value">
                {formatKGS(previousMonthCash)}
              </span>
            </p>
            <p>
              Банк:{' '}
              <span className="global-summary-balance-details__value">
                {formatKGS(previousMonthBank)}
              </span>
            </p>
            <p>
              Чистый результат:{' '}
              <span
                className={
                  net >= 0 ? 'global-summary-balance-details__value positive' : 'global-summary-balance-details__value negative'
                }
              >
                {formatKGS(net)}
              </span>
            </p>
            <p>
              Изменение остатка за месяц:{' '}
              <span className="global-summary-balance-details__value">
                {formatKGS(balanceChange)}
              </span>
            </p>
          </div>
        )}
        {!isLoading && !hasError && kpiData && (
          <div className="global-summary-transfers">
            <div className="global-summary-section-header">
              <div className="global-summary-section-header__info">
                <h4 className="global-summary-section-title">Переводы между счетами</h4>
                <p className="global-summary-transfers__hint">
                  Внутренние переводы между кассой и банком. Не влияют на доходы и расходы (P&amp;L).
                </p>
              </div>
              <div className="global-summary-section-header__actions" />
            </div>
            <div className="transfer-summary-table-wrapper">
              <table className="transfer-summary-table">
                <thead>
                  <tr>
                    <th scope="col">Направление</th>
                    <th scope="col">Сумма</th>
                    <th scope="col">Комментарий</th>
                    <th scope="col">Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {(['BANK_TO_CASH', 'CASH_TO_BANK'] as const).map((directionKey) => {
                    const isOpen = openTransferDirection === directionKey
                    const isBankToCash = directionKey === 'BANK_TO_CASH'
                    const total = isBankToCash ? bankToCashMonth : cashToBankMonth
                    const directionLabel = isBankToCash ? 'Банк → Касса' : 'Касса → Банк'
                    const shortComment =
                      total === 0 ? 'Переводов не было' : 'Внутренний перевод (не влияет на P&L)'

                    const details =
                      transferDetails &&
                      (isBankToCash
                        ? transferDetails.bank_to_cash
                        : transferDetails.cash_to_bank)

                    return (
                      <Fragment key={directionKey}>
                        <tr className={isOpen ? 'transfer-summary-row transfer-summary-row--open' : 'transfer-summary-row'}>
                          <td>{directionLabel}</td>
                          <td className="transfer-summary-amount">
                            {formatKGS(total)}
                          </td>
                          <td title="Внутренний перевод между счетами. Не влияет на доходы и расходы.">
                            {shortComment}
                          </td>
                          <td className="transfer-summary-actions">
                            <button
                              type="button"
                              className="transfer-action-btn"
                              onClick={() =>
                                setOpenTransferDirection((current) =>
                                  current === directionKey ? null : directionKey
                                )
                              }
                            >
                              <span className="transfer-toggle-icon">
                                {isOpen ? '▴' : '▾'}
                              </span>
                              <span className="transfer-toggle-label">
                                {isOpen ? 'Скрыть' : 'Показать'}
                              </span>
                            </button>
                            {canExportPdf && (
                              <button
                                type="button"
                                className="transfer-action-btn transfer-action-btn--secondary"
                                onClick={() => {
                                  const mappedDirection =
                                    directionKey === 'BANK_TO_CASH'
                                      ? 'BANK_TO_CASH'
                                      : 'CASH_TO_BANK'

                                  void (async () => {
                                    const resp = await fetch(
                                      `/api/v1/reports/transfers-direction-pdf/?month=${month}&direction=${mappedDirection}`,
                                      {
                                        method: 'GET',
                                        headers: {
                                          ...(accessToken && {
                                            Authorization: `Bearer ${accessToken}`,
                                          }),
                                        },
                                        credentials: 'include',
                                      },
                                    )
                                    if (!resp.ok) {
                                      return
                                    }
                                    const blob = await resp.blob()
                                    const url = URL.createObjectURL(blob)
                                    const link = document.createElement('a')
                                    link.href = url
                                    link.download =
                                      mappedDirection === 'BANK_TO_CASH'
                                        ? `transfers_bank_to_cash_${month}.pdf`
                                        : `transfers_cash_to_bank_${month}.pdf`
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                    URL.revokeObjectURL(url)
                                  })()
                                }}
                              >
                                PDF
                              </button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="transfer-details-row">
                            <td colSpan={4}>
                              <div className="transfer-details-panel">
                                {loadingTransfers && !transferError && (
                                  <div className="summary-loading">
                                    {t('loading')}
                                  </div>
                                )}
                                {transferError && !loadingTransfers && (
                                  <div className="summary-error">
                                    {t('errors.loadDetails')}
                                  </div>
                                )}
                                {!loadingTransfers && !transferError && (
                                  <>
                                    <div className="transfer-details-header">
                                      <span className="transfer-details-title">
                                        Операции по направлению: {directionLabel}
                                      </span>
                                    </div>
                                    {details && details.length > 0 ? (
                                      <table className="transfer-details-table">
                                        <thead>
                                          <tr>
                                            <th scope="col">Дата</th>
                                            <th scope="col">Откуда</th>
                                            <th scope="col">Куда</th>
                                            <th scope="col">Сумма</th>
                                            <th scope="col">Комментарий</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {details.map((item) => (
                                            <tr key={item.id}>
                                              <td>{formatDate(item.transferred_at)}</td>
                                              <td>
                                                {item.source_account === 'CASH' ? 'Касса' : 'Банк'}
                                              </td>
                                              <td>
                                                {item.destination_account === 'CASH'
                                                  ? 'Касса'
                                                  : 'Банк'}
                                              </td>
                                              <td className="transfer-details-amount">
                                                {formatKGS(parseFloat(item.amount))}
                                              </td>
                                              <td>{item.comment || '—'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <div className="summary-no-data">Операций нет</div>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

