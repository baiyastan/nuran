import './Table.css'

export type TableColumn = {
  key: string
  label: string
  /** Cell alignment (defaults to 'left'). Use 'right' for numeric columns. */
  align?: 'left' | 'right' | 'center'
  /** Render with tabular-nums so digits line up across rows. */
  numeric?: boolean
}

export type TableProps<T = Record<string, unknown>> = {
  columns: TableColumn[]
  data: T[]
  renderCell?: (column: string, value: unknown, row: T) => React.ReactNode
  rowClassNameKey?: string
  /** Apply alternating row backgrounds for readability on long lists. */
  zebra?: boolean
}

function cellClassName(column: TableColumn): string {
  const classes = []
  if (column.align === 'right') classes.push('table-cell--right')
  else if (column.align === 'center') classes.push('table-cell--center')
  if (column.numeric) classes.push('table-cell--numeric')
  return classes.join(' ')
}

export function Table<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  renderCell,
  rowClassNameKey,
  zebra = false,
}: TableProps<T>) {
  return (
    <div className="table-wrapper">
      <table className={`table${zebra ? ' table--zebra' : ''}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cellClassName(column)}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                No data available
              </td>
            </tr>
          ) : (
            data.map((row, index) => {
              const rowRecord = row as Record<string, unknown>
              const rowClassName =
                rowClassNameKey && typeof rowRecord[rowClassNameKey] === 'string'
                  ? (rowRecord[rowClassNameKey] as string)
                  : ''

              return (
                <tr key={index} className={rowClassName}>
                  {columns.map((column) => {
                    const value = rowRecord[column.key]
                    return (
                      <td
                        key={column.key}
                        data-label={column.label}
                        data-column={column.key}
                        className={cellClassName(column)}
                      >
                        <span className="table-mobile-label">{column.label}</span>
                        <span className="table-mobile-value">
                          {renderCell
                            ? renderCell(column.key, value, row)
                            : (value as React.ReactNode)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
