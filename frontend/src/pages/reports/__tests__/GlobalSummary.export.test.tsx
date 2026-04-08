import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
  useGetTransferDetailsQuery,
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
    useGetTransferDetailsQuery: vi.fn(),
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
        planning_actual_expense_total: '0.00',
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

    vi.mocked(useGetTransferDetailsQuery).mockReturnValue({
      data: { month: '2026-03', bank_to_cash: [], cash_to_bank: [] },
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
        planning_actual_expense_total: '0.00',
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

    const balanceToggle = screen.getByRole('button', {
      name: /Показать детализацию остатков по счетам/i,
    })
    expect(balanceToggle).toBeInTheDocument()
    expect(screen.queryByText(/Мурунку айдан остаток/i)).not.toBeInTheDocument()

    fireEvent.click(balanceToggle)

    await waitFor(() => {
      const balancePanel = document.querySelector('.global-summary-balance-details')
      expect(balancePanel).toBeTruthy()
      expect(
        within(balancePanel as HTMLElement).getByText(/Мурунку айдан остаток/i)
      ).toBeInTheDocument()
      expect(within(balancePanel as HTMLElement).getByText(/150.*сом/i)).toBeInTheDocument()
      expect(within(balancePanel as HTMLElement).getByText(/250.*сом/i)).toBeInTheDocument()
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
        planning_actual_expense_total: '0.00',
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

    expect(
      screen.getByText(/Внутренние переводы между кассой и банком/i)
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
        planning_actual_expense_total: '0.00',
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

    const transfersSection = screen.getByText(/Переводы между счетами/i).closest('.global-summary-transfers')
    expect(transfersSection).toBeTruthy()
    const transferShowButtons = within(transfersSection as HTMLElement).getAllByRole('button', {
      name: /Показать/i,
    })
    fireEvent.click(transferShowButtons[0])

    await waitFor(() => {
      const title = screen.getByText(/Операции по направлению/i)
      const panel = title.closest('.transfer-details-panel')
      expect(panel).toBeTruthy()
      const tables = within(panel as HTMLElement).getAllByRole('table')
      const detailTable = tables[tables.length - 1]
      expect(within(detailTable).getByText(/B->C/i)).toBeInTheDocument()
    })

    const cashToBankRow = screen.getByText(/Касса → Банк/i).closest('tr')
    expect(cashToBankRow).toBeTruthy()
    fireEvent.click(
      within(cashToBankRow as HTMLTableRowElement).getByRole('button', { name: /Показать/i })
    )

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
        planning_actual_expense_total: '0.00',
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

  it('uses parent filter params for section PDF export', async () => {
    exportTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )
    fireEvent.change(screen.getByLabelText('Дата с'), { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getByLabelText('Дата по'), { target: { value: '2026-03-15' } })
    fireEvent.click(screen.getByRole('button', { name: /Применить/i }))
    fireEvent.change(screen.getByLabelText('Счёт'), { target: { value: 'CASH' } })
    fireEvent.click(screen.getByRole('button', { name: /Скачать PDF/i }))

    await waitFor(() => {
      expect(exportTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        sectionType: 'income_sources',
        account: 'CASH',
        start_date: '2026-03-01',
        end_date: '2026-03-15',
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

  it('uses local detail filter params for income detail PDF export', async () => {
    exportIncomeDetailTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )
    fireEvent.change(screen.getAllByLabelText('Дата с')[0], { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[0], { target: { value: '2026-03-30' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[0])

    fireEvent.click(screen.getByRole('button', { name: 'Source A' }))
    fireEvent.change(screen.getAllByLabelText('Дата с')[1], { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[1], { target: { value: '2026-03-20' } })
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'CASH' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[1])
    fireEvent.click(screen.getByRole('button', { name: /Source A Скачать PDF/i }))

    await waitFor(() => {
      expect(exportIncomeDetailTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        sourceId: 1,
        account: 'CASH',
        start_date: '2026-03-10',
        end_date: '2026-03-20',
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

  it('falls back to parent params for expense detail PDF export', async () => {
    exportExpenseDetailTrigger.mockReturnValue({
      unwrap: () => Promise.resolve(new Blob(['pdf'], { type: 'application/pdf' })),
    })

    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getAllByLabelText('Дата с')[0], { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[0], { target: { value: '2026-03-20' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[0])
    fireEvent.change(screen.getByLabelText('Счёт'), { target: { value: 'BANK' } })
    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))
    fireEvent.click(screen.getByRole('button', { name: /Category A Скачать PDF/i }))

    await waitFor(() => {
      expect(exportExpenseDetailTrigger).toHaveBeenCalledWith({
        month: '2026-03',
        categoryId: 10,
        account: 'BANK',
        start_date: '2026-03-01',
        end_date: '2026-03-20',
      })
    })
  })

  it('shows date range inputs only in expanded income/expense panels', () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)

    expect(screen.queryByLabelText(/Дата с/i)).not.toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию доходов по источникам/i })
    )
    expect(screen.getByLabelText(/Дата с/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Дата по/i)).toBeInTheDocument()
  })

  it('applies and resets date range in detail queries', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)

    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getByLabelText(/Дата с/i), { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getByLabelText(/Дата по/i), { target: { value: '2026-03-20' } })
    fireEvent.click(screen.getByRole('button', { name: /Применить/i }))

    await waitFor(() => {
      expect(useGetDashboardExpenseCategoriesQuery).toHaveBeenLastCalledWith({
        month: '2026-03',
        start_date: '2026-03-10',
        end_date: '2026-03-20',
      })
      expect(screen.getByText(/Период: 2026-03-10/i)).toBeInTheDocument()
      expect(screen.getByText(/План и разница рассчитаны относительно месячного плана/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Сбросить/i }))
    await waitFor(() => {
      expect(useGetDashboardExpenseCategoriesQuery).toHaveBeenLastCalledWith({
        month: '2026-03',
      })
    })
  })

  it('shows invalid range message and disables apply button', () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getByLabelText(/Дата с/i), { target: { value: '2026-03-20' } })
    fireEvent.change(screen.getByLabelText(/Дата по/i), { target: { value: '2026-03-10' } })
    expect(screen.getByText(/Дата начала не может быть позже даты окончания/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Применить/i })).toBeDisabled()
  })

  it('detail filter defaults from parent filter values', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getAllByLabelText('Дата с')[0], { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[0], { target: { value: '2026-03-30' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[0])

    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))
    await waitFor(() => {
      expect(screen.getAllByLabelText('Дата с')[1]).toHaveValue('2026-03-01')
      expect(screen.getAllByLabelText('Дата по')[1]).toHaveValue('2026-03-30')
    })
  })

  it('detail apply overrides only detail rows query', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getAllByLabelText('Дата с')[0], { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[0], { target: { value: '2026-03-30' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))

    fireEvent.change(screen.getAllByLabelText('Дата с')[1], { target: { value: '2026-03-10' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[1], { target: { value: '2026-03-20' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[1])

    await waitFor(() => {
      expect(useGetDashboardExpenseCategoriesQuery).toHaveBeenCalledWith({
        month: '2026-03',
        start_date: '2026-03-01',
        end_date: '2026-03-30',
      })
      expect(useListActualExpensesQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 10,
          month: '2026-03',
          start_date: '2026-03-10',
          end_date: '2026-03-20',
        }),
        { skip: false }
      )
    })
  })

  it('passes local detail account filter to expense detail query args', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))

    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'BANK' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[1])

    await waitFor(() => {
      expect(useListActualExpensesQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 10,
          month: '2026-03',
          account: 'BANK',
        }),
        { skip: false }
      )
    })
  })

  it('detail range outside parent range shows validation error', async () => {
    renderWithProviders(<GlobalSummary month="2026-03" />)
    fireEvent.click(
      screen.getByRole('button', { name: /Показать детализацию расходов по категориям/i })
    )
    fireEvent.change(screen.getAllByLabelText('Дата с')[0], { target: { value: '2026-03-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[0], { target: { value: '2026-03-30' } })
    fireEvent.click(screen.getAllByRole('button', { name: /Применить/i })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Category A' }))
    fireEvent.change(screen.getAllByLabelText('Дата с')[1], { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getAllByLabelText('Дата по')[1], { target: { value: '2026-04-05' } })

    await waitFor(() => {
      expect(
        screen.getByText(/Диапазон детализации должен быть внутри общего диапазона/i)
      ).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /Применить/i })[1]).toBeDisabled()
    })
  })
})
