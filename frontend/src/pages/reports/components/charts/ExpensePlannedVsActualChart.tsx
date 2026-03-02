import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatKGS } from '@/shared/lib/utils'
import './Chart.css'

interface ExpensePlannedVsActualChartProps {
  data: Array<{
    category_id: number | null
    category_name: string
    planned: number
    actual: number
  }>
}

export function ExpensePlannedVsActualChart({ data }: ExpensePlannedVsActualChartProps) {
  const { t } = useTranslation('reports')
  
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t('expense.charts.emptyData')}</p>
      </div>
    )
  }

  const chartData = data.map((item) => {
    const categoryKey = item.category_id !== null && item.category_id !== undefined
      ? String(item.category_id)
      : 'uncategorized'

    const categoryName = item.category_name || t('expense.tables.actual.uncategorized')

    return {
      categoryKey,
      categoryName,
      planned: item.planned,
      actual: item.actual,
    }
  })

  const keyToName = chartData.reduce<Record<string, string>>((acc, item) => {
    acc[item.categoryKey] = item.categoryName
    return acc
  }, {})

  const formatCurrency = (value?: number) => formatKGS(value ?? 0)

  const renderTooltip = ({
    active,
    payload,
  }: {
    active?: boolean
    payload?: readonly { payload: { categoryName: string; planned: number; actual: number } }[]
  }) => {
    if (!active || !payload || payload.length === 0) {
      return null
    }

    const item = payload[0].payload

    return (
      <div className="tooltip">
        <p className="tooltip-title">{item.categoryName}</p>
        <div className="tooltip-row">
          <span className="tooltip-dot" style={{ background: '#007bff' }} />
          <span className="tooltip-label">{t('expense.charts.legendPlanned')}</span>
          <span className="tooltip-value">{formatCurrency(item.planned)}</span>
        </div>
        <div className="tooltip-row">
          <span className="tooltip-dot" style={{ background: '#ff9800' }} />
          <span className="tooltip-label">{t('expense.charts.legendActual')}</span>
          <span className="tooltip-value">{formatCurrency(item.actual)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="chart-container">
      <h3>{t('expense.charts.plannedVsActualByCategory')}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 20, left: 40, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="categoryKey"
            tickFormatter={(value: string | number) => keyToName[String(value)] ?? String(value)}
            angle={-45}
            textAnchor="end"
            height={100}
            interval={0}
          />
          <YAxis width={80} tickFormatter={formatCurrency} />
          <Tooltip cursor={false} content={renderTooltip} />
          <Legend />
          <Bar dataKey="planned" fill="#007bff" name={t('expense.charts.legendPlanned')} />
          <Bar dataKey="actual" fill="#ff9800" name={t('expense.charts.legendActual')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

