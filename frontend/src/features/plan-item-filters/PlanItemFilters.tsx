import { useState, useEffect } from 'react'
import { PlanItemListParams } from '@/shared/api/planItemsApi'
import { Input } from '@/shared/ui/Input/Input'
import { Button } from '@/shared/ui/Button/Button'
import './PlanItemFilters.css'

interface PlanItemFiltersProps {
  filters: PlanItemListParams
  onChange: (filters: PlanItemListParams) => void
}

export function PlanItemFilters({ filters, onChange }: PlanItemFiltersProps) {
  const [localFilters, setLocalFilters] = useState<PlanItemListParams>(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const handleChange = (key: keyof PlanItemListParams, value: string | number | undefined) => {
    const newFilters = { ...localFilters, [key]: value || undefined }
    setLocalFilters(newFilters)
  }

  const handleApply = () => {
    onChange(localFilters)
  }

  const handleReset = () => {
    const emptyFilters: PlanItemListParams = {}
    setLocalFilters(emptyFilters)
    onChange(emptyFilters)
  }

  return (
    <div className="plan-item-filters">
      <h3>Filters</h3>
      <div className="filters-grid">
        <Input
          label="Status"
          value={localFilters.status || ''}
          onChange={(e) => handleChange('status', e.target.value)}
          placeholder="draft, submitted, approved, locked"
        />
        <Input
          label="Project ID"
          type="number"
          value={localFilters.project_id?.toString() || ''}
          onChange={(e) => handleChange('project_id', e.target.value ? parseInt(e.target.value, 10) : undefined)}
        />
        <Input
          label="Plan Period ID"
          type="number"
          value={localFilters.plan_period_id?.toString() || ''}
          onChange={(e) => handleChange('plan_period_id', e.target.value ? parseInt(e.target.value, 10) : undefined)}
        />
        <Input
          label="Created By (User ID)"
          type="number"
          value={localFilters.created_by?.toString() || ''}
          onChange={(e) => handleChange('created_by', e.target.value ? parseInt(e.target.value, 10) : undefined)}
        />
        <Input
          label="Date From"
          type="date"
          value={localFilters.date_from || ''}
          onChange={(e) => handleChange('date_from', e.target.value)}
        />
        <Input
          label="Date To"
          type="date"
          value={localFilters.date_to || ''}
          onChange={(e) => handleChange('date_to', e.target.value)}
        />
        <Input
          label="Amount Min"
          type="number"
          step="0.01"
          value={localFilters.amount_min?.toString() || ''}
          onChange={(e) => handleChange('amount_min', e.target.value ? parseFloat(e.target.value) : undefined)}
        />
        <Input
          label="Amount Max"
          type="number"
          step="0.01"
          value={localFilters.amount_max?.toString() || ''}
          onChange={(e) => handleChange('amount_max', e.target.value ? parseFloat(e.target.value) : undefined)}
        />
        <Input
          label="Category"
          value={localFilters.category || ''}
          onChange={(e) => handleChange('category', e.target.value)}
        />
      </div>
      <div className="filters-actions">
        <Button onClick={handleApply}>Apply Filters</Button>
        <Button onClick={handleReset} variant="secondary">Reset</Button>
      </div>
    </div>
  )
}
