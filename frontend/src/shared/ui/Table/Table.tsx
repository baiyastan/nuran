import './Table.css'

export type TableColumn = { key: string; label: string }

export type TableProps<T = Record<string, unknown>> = {
  columns: TableColumn[]
  data: T[]
  renderCell?: (column: string, value: unknown, row: T) => React.ReactNode
  rowClassNameKey?: string
}

export function Table<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  renderCell,
  rowClassNameKey,
}: TableProps<T>) {
  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
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
                      <td key={column.key}>
                        {renderCell
                          ? renderCell(column.key, value, row)
                          : (value as React.ReactNode)}
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
