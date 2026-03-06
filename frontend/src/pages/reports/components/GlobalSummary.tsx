import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Table } from '@/shared/ui/Table/Table'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import {
  useGetDashboardExpenseCategoriesQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardKpiQuery,
} from '@/shared/api/reportsApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'
import { formatDate, formatKGS } from '@/shared/lib/utils'
import './SummaryCard.css'

interface GlobalSummaryProps {
  month: string
}

type OpenPanel = 'income' | 'expense' | 'net' | null

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

export function GlobalSummary({ month }: GlobalSummaryProps) {
  const { t } = useTranslation('reports')
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
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

  return (
    <div className="report-section global-summary-section">
      <h2>{t('globalSummary.title')}</h2>
      <div className="summary-card global-summary">
        <h3>{t('globalSummary.summaryTitle')}</h3>
        {isLoading && (
          <div className="summary-loading">
            {t('loading')}
          </div>
        )}
        {hasError && !isLoading && (
          <div className="summary-error">
            {t('errors.generic', { defaultValue: 'Failed to load summary' })}
          </div>
        )}
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
              title={t('globalSummary.actions.viewIncomeBreakdown')}
              onClick={() =>
                setOpenPanel((current) => (current === 'income' ? null : 'income'))
              }
            >
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
              title={t('globalSummary.actions.viewExpenseBreakdown')}
              onClick={() =>
                setOpenPanel((current) => (current === 'expense' ? null : 'expense'))
              }
            >
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
              title={t('globalSummary.actions.viewNetBreakdown')}
              onClick={() =>
                setOpenPanel((current) => (current === 'net' ? null : 'net'))
              }
            >
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
            </button>
          </div>
        </div>
        {openPanel === 'income' && incomeBySource.length > 0 && (
          <div className="global-summary-breakdown">
            <Table
              columns={[
                { key: 'source_name', label: t('income.tables.actual.columns.sourceName') },
                { key: 'plan', label: t('income.labels.plan') },
                { key: 'fact', label: t('income.labels.actual') },
                { key: 'diff', label: t('income.labels.diff') },
                { key: 'count', label: t('common.count', { defaultValue: 'Count' }) },
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
                <h4 className="expense-details-title">
                  {selectedIncomeSourceName} – {t('globalSummary.details')}
                </h4>

                {loadingIncomeDetails && (
                  <div className="summary-loading">
                    {t('loading')}
                  </div>
                )}

                {incomeDetailsError && !loadingIncomeDetails && (
                  <div className="summary-error">
                    {t('errors.generic', { defaultValue: 'Failed to load details' })}
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
            <Table
              columns={[
                { key: 'category_name', label: t('expense.tables.actual.columns.categoryName') },
                { key: 'plan', label: t('expense.labels.plan') },
                { key: 'fact', label: t('expense.labels.actual') },
                { key: 'diff', label: t('expense.labels.diff') },
                { key: 'count', label: t('common.count', { defaultValue: 'Count' }) },
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
                <h4 className="expense-details-title">
                  {selectedExpenseCategoryName} – {t('globalSummary.details')}
                </h4>

                {loadingExpenseDetails && (
                  <div className="summary-loading">
                    {t('loading')}
                  </div>
                )}

                {expenseDetailsError && !loadingExpenseDetails && (
                  <div className="summary-error">
                    {t('errors.generic', { defaultValue: 'Failed to load details' })}
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
      </div>
    </div>
  )
}

