import { useTranslation } from 'react-i18next'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatKGS } from '@/shared/lib/utils'
import './Chart.css'

interface IncomeDailyChartProps {
  data: Array<{
    date: string
    total: number
  }>
}

export function IncomeDailyChart({ data }: IncomeDailyChartProps) {
  const { t } = useTranslation('reports')
  
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t('income.charts.emptyEntries')}</p>
      </div>
    )
  }

  const chartData = data.map((item) => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    total: item.total,
  }))

  const formatCurrency = (value?: number) => formatKGS(value ?? 0)

  return (
    <div className="chart-container">
      <h3>{t('income.charts.dailyTotals')}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis tickFormatter={formatCurrency} />
          <Tooltip formatter={(value) => formatCurrency(value as number | undefined)} />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="total" 
            stroke="#28a745" 
            strokeWidth={2}
            name={t('income.charts.legendDailyTotal')}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

