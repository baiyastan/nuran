import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { formatKGS } from '@/shared/lib/utils'
import './Chart.css'

interface IncomePlannedVsActualChartProps {
  data: Array<{
    source_id: number
    source_name: string
    planned: number
    actual: number
  }>
}

export function IncomePlannedVsActualChart({ data }: IncomePlannedVsActualChartProps) {
  const { t } = useTranslation('reports')
  
  if (!data || data.length === 0) {
    return (
      <div className="chart-empty">
        <p>{t('income.charts.emptyData')}</p>
      </div>
    )
  }

  const chartData = data.map((item) => ({
    source: item.source_name,
    planned: item.planned,
    actual: item.actual,
  }))

  const formatCurrency = (value?: number) => formatKGS(value ?? 0)

  return (
    <div className="chart-container">
      <h3>{t('income.charts.plannedVsActualBySource')}</h3>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="source" 
            angle={-45}
            textAnchor="end"
            height={100}
            interval={0}
          />
          <YAxis tickFormatter={formatCurrency} />
          <Tooltip formatter={(value) => formatCurrency(value as number | undefined)} />
          <Legend />
          <Bar dataKey="planned" fill="#007bff" name={t('income.charts.legendPlanned')} />
          <Bar dataKey="actual" fill="#28a745" name={t('income.charts.legendActual')} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

