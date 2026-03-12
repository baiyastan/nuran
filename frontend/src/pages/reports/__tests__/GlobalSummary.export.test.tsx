import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@/shared/i18n'
import i18n from '@/shared/i18n'
import { renderWithProviders } from '@/testing/renderWithProviders'
import { GlobalSummary } from '../components/GlobalSummary'
import {
  useExportExpenseCategoryDetailPdfMutation,
  useExportIncomeSourceDetailPdfMutation,
  useExportSectionPdfMutation,
  useGetDashboardExpenseCategoriesQuery,
  useGetDashboardIncomeSourcesQuery,
  useGetDashboardKpiQuery,
} from '@/shared/api/reportsApi'
import { useListIncomeEntriesQuery } from '@/shared/api/incomeEntriesApi'
import { useListActualExpensesQuery } from '@/shared/api/actualExpensesApi'

vi.mock('@/shared/api/reportsApi', async () => {
  const actual = await vi.importActual<typeof import('@/shared/api/reportsApi')>(
    '@/shared/api/reportsApi'
  )

  return {
    ...actual,
    useExportExpenseCategoryDetailPdfMutation: vi.fn(),
    useExportIncomeSourceDetailPdfMutation: vi.fn(),
    useGetDashboardKpiQuery: vi.fn(),
    useGetDashboardExpenseCategoriesQuery: vi.fn(),
    useGetDashboardIncomeSourcesQuery: vi.fn(),
    useExportSectionPdfMutation: vi.fn(),
  }
})

vi.mock('@/shared/api/incomeEntriesApi', () => ({
  useListIncomeEntriesQuery: vi.fn(),
}))

vi.mock('@/shared/api/actualExpensesApi', () => ({
  useListActualExpensesQuery: vi.fn(),
}))

describe('GlobalSummary section PDF export', () => {
  const exportTrigger = vi.fn()
  const exportIncomeDetailTrigger = vi.fn()
  const exportExpenseDetailTrigger = vi.fn()
  const createObjectUrlMock = vi.fn(() => 'blob:mock')
  const revokeObjectUrlMock = vi.fn()
  let anchorClickSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    exportTrigger.mockReset()
    exportIncomeDetailTrigger.mockReset()
    exportExpenseDetailTrigger.mockReset()
    createObjectUrlMock.mockClear()
    revokeObjectUrlMock.mockClear()
    await i18n.changeLanguage('ru')

    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-03',
        income_fact: '1000.00',
        expense_fact: '400.00',
        net: '600.00',
        income_plan: '800.00',
        expense_plan: '300.00',
        net_plan: '500.00',
        cash_balance: '0.00',
        bank_balance: '0.00',
        cash_opening_balance: '0.00',
        bank_opening_balance: '0.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '0.00',
        bank_closing_balance: '0.00',
        bank_to_cash_month: '0.00',
        cash_to_bank_month: '0.00',
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useGetDashboardIncomeSourcesQuery).mockReturnValue({
      data: {
        month: '2026-03',
        totals: { plan: '800.00', fact: '1000.00' },
        rows: [
          {
            source_id: 1,
            source_name: 'Source A',
            plan: '800.00',
            fact: '1000.00',
            diff: '200.00',
            count: 2,
            sharePercent: 100,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useGetDashboardExpenseCategoriesQuery).mockReturnValue({
      data: {
        month: '2026-03',
        totals: { plan: '300.00', fact: '400.00' },
        rows: [
          {
            category_id: 10,
            category_name: 'Category A',
            plan: '300.00',
            fact: '400.00',
            diff: '100.00',
            count: 1,
            sharePercent: 100,
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useListIncomeEntriesQuery).mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        total_count: 1,
        total_amount: '1000.00',
        results: [
          {
            id: 1,
            received_at: '2026-03-10',
            created_at: '2026-03-10T00:00:00Z',
            amount: '1000.00',
            comment: 'Income comment',
            created_by_username: 'admin',
            source: { id: 1, name: 'Source A' },
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useListActualExpensesQuery).mockReturnValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        total_count: 1,
        total_amount: '400.00',
        results: [
          {
            id: 9,
            spent_at: '2026-03-12',
            amount: '400.00',
            comment: 'Expense comment',
            created_by_username: 'admin',
          },
        ],
      },
      isLoading: false,
      error: null,
    } as never)

    vi.mocked(useExportSectionPdfMutation).mockReturnValue([
      exportTrigger,
      { isLoading: false },
    ] as never)
    vi.mocked(useExportIncomeSourceDetailPdfMutation).mockReturnValue([
      exportIncomeDetailTrigger,
      { isLoading: false },
    ] as never)
    vi.mocked(useExportExpenseCategoryDetailPdfMutation).mockReturnValue([
      exportExpenseDetailTrigger,
      { isLoading: false },
    ] as never)

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrlMock,
      revokeObjectURL: revokeObjectUrlMock,
    })

    anchorClickSpy = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClickSpy)
  })

  it('shows the export action only for the opened section', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)

    expect(screen.queryByRole('button', { name: /Скачать PDF/i })).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )

    expect(screen.getByRole('button', { name: /Скачать PDF/i })).toBeInTheDocument()
    expect(
      screen.getByText(/Итоги по источникам доходов/i)
    ).toBeInTheDocument()
  })

  it('renders previous month balance block collapsed by default and expands with formatted values', async () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-03',
        income_fact: '1000.00',
        expense_fact: '400.00',
        net: '600.00',
        income_plan: '800.00',
        expense_plan: '300.00',
        net_plan: '500.00',
        cash_balance: '500.00',
        bank_balance: '200.00',
        cash_opening_balance: '150.00',
        bank_opening_balance: '250.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '0.00',
        bank_closing_balance: '0.00',
      },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<GlobalSummary month="2026-03" />)

    // Block header is present, content is hidden by default
    const headerButton = screen.getByRole('button', { name: /Мурунку айдан остаток/i })
    expect(headerButton).toBeInTheDocument()
    expect(screen.queryByText(/Касса:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Банк:/i)).not.toBeInTheDocument()

    // Expand
    fireEvent.click(headerButton)

    // Values are formatted with formatKGS (contains "сом")
    await waitFor(() => {
      expect(screen.getByText(/Касса:/i)).toBeInTheDocument()
      expect(screen.getByText(/Банк:/i)).toBeInTheDocument()
      expect(screen.getByText(/150.*сом/i)).toBeInTheDocument()
      expect(screen.getByText(/250.*сом/i)).toBeInTheDocument()
    })
  })

  it('exports the income section PDF with loading state and download filename', async () => {
    let resolveExport!: (blob: Blob) => void
    const exportPromise = new Promise<Blob>((resolve) => {
      resolveExport = resolve
    })
    exportTrigger.mockReturnValue({
      unwrap: () => exportPromise,
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )
    fireEvent.click(screen.getByRole('button', { name: /Скачать PDF/i }))

    expect(exportTrigger).toHaveBeenCalledWith({
      month: '2026-03',
      sectionType: 'income_sources',
    })
    const loadingButton = screen.getByRole('button', {
      name: /Итоги по источникам доходов Скачать PDF/i,
    })
    expect(loadingButton).toBeDisabled()
    expect(loadingButton).toHaveTextContent(/Подготовка PDF/i)

    resolveExport(new Blob(['pdf'], { type: 'application/pdf' }))

    await waitFor(() => {
      expect(createObjectUrlMock).toHaveBeenCalled()
      expect(anchorClickSpy).toHaveBeenCalled()
      expect(revokeObjectUrlMock).toHaveBeenCalled()
    })
  })

  it('renders transfer summary and clarifying helper text', () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-03',
        income_fact: '1000.00',
        expense_fact: '400.00',
        net: '600.00',
        income_plan: '800.00',
        expense_plan: '300.00',
        net_plan: '500.00',
        cash_balance: '100.00',
        bank_balance: '200.00',
        cash_opening_balance: '50.00',
        bank_opening_balance: '150.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '100.00',
        bank_closing_balance: '200.00',
        bank_to_cash_month: '30.00',
        cash_to_bank_month: '10.00',
      },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<GlobalSummary month="2026-03" />)

    // Helper text / explanations
    expect(
      screen.getByText(/Факт расходов может включать плановые корректировки/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/Чистый результат — это показатель P&L/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Остаток на счетах — это итоговый баланс кассы и банковских счетов/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Переводы между счетами не изменяют чистый результат/i)
    ).toBeInTheDocument()

    // Transfer summary table at the bottom of the card
    expect(screen.getByText(/Переводы между счетами/i)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Направление/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Сумма/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Комментарий/i })).toBeInTheDocument()
    expect(screen.getByText(/Банк → Касса/i)).toBeInTheDocument()
    expect(screen.getByText(/Касса → Банк/i)).toBeInTheDocument()
  })

  it('expands transfer details per direction and shows empty state', async () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-03',
        income_fact: '0.00',
        expense_fact: '0.00',
        net: '0.00',
        income_plan: '0.00',
        expense_plan: '0.00',
        net_plan: '0.00',
        cash_balance: '0.00',
        bank_balance: '0.00',
        cash_opening_balance: '0.00',
        bank_opening_balance: '0.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '0.00',
        bank_closing_balance: '0.00',
        bank_to_cash_month: '100.00',
        cash_to_bank_month: '0.00',
      },
      isLoading: false,
      error: null,
    } as never)

    // Mock transfer details hook
    vi.mocked(useGetTransferDetailsQuery as any).mockReturnValue({
      data: {
        month: '2026-03',
        bank_to_cash: [
          {
            id: 1,
            transferred_at: '2026-03-05',
            source_account: 'BANK',
            destination_account: 'CASH',
            amount: '100.00',
            comment: 'B->C',
            created_by_username: 'admin',
          },
        ],
        cash_to_bank: [],
      },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<GlobalSummary month="2026-03" />)

    // Open BANK -> CASH details
    fireEvent.click(screen.getByRole('button', { name: /Показать/i }))

    await waitFor(() => {
      expect(screen.getByText(/Дата/i)).toBeInTheDocument()
      expect(screen.getByText(/Откуда/i)).toBeInTheDocument()
      expect(screen.getByText(/Куда/i)).toBeInTheDocument()
      expect(screen.getByText(/Сумма/i)).toBeInTheDocument()
      expect(screen.getByText(/Комментарий/i)).toBeInTheDocument()
      expect(screen.getByText(/B->C/i)).toBeInTheDocument()
    })

    // Toggle to CASH -> BANK direction (empty state)
    const buttons = screen.getAllByRole('button', { name: /Показать/i })
    fireEvent.click(buttons[1])

    await waitFor(() => {
      expect(screen.getByText(/Операций нет/i)).toBeInTheDocument()
    })
  })

  it('shows total balance equal to sum of cash and bank closing balances', () => {
    vi.mocked(useGetDashboardKpiQuery).mockReturnValue({
      data: {
        month: '2026-03',
        income_fact: '0.00',
        expense_fact: '0.00',
        net: '0.00',
        income_plan: '0.00',
        expense_plan: '0.00',
        net_plan: '0.00',
        cash_balance: '0.00',
        bank_balance: '0.00',
        cash_opening_balance: '0.00',
        bank_opening_balance: '0.00',
        cash_inflow_month: '0.00',
        cash_outflow_month: '0.00',
        bank_inflow_month: '0.00',
        bank_outflow_month: '0.00',
        cash_closing_balance: '150.00',
        bank_closing_balance: '250.00',
        bank_to_cash_month: '0.00',
        cash_to_bank_month: '0.00',
      },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<GlobalSummary month="2026-03" />)

    // Label renamed to "Остаток на счетах" and value is sum of cash + bank closing
    expect(screen.getByText(/Остаток на счетах:/i)).toBeInTheDocument()
    expect(screen.getByText(/400.*сом/i)).toBeInTheDocument()
  })

  it('exports the expense section with the expense section type', async () => {
    exportTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.click(screen.getByRole('button', { name: /Скачать PDF/i }))

    await waitFor(() => {
      expect(exportTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        sectionType: 'expense_categories',
      })
    })
  })

  it('exports the selected income-source detail PDF', async () => {
    exportIncomeDetailTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Source A' }))
    fireEvent.click(screen.getByRole('button', { name: /Source A Скачать PDF/i }))

    await waitFor(() => {
      expect(exportIncomeDetailTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        sourceId: 1,
      })
    })
  })

  it('exports the selected expense-category detail PDF', async () => {
    exportExpenseDetailTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))
    fireEvent.click(screen.getByRole('button', { name: /Category A Скачать PDF/i }))

    await waitFor(() => {
      expect(exportExpenseDetailTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        categoryId: 10,
      })
    })
  })
})
