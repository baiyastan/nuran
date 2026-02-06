import './Table.css'

interface TableProps {
  columns: { key: string; label: string }[]
  data: Record<string, any>[]
  renderCell?: (column: string, value: any, row: Record<string, any>) => React.ReactNode
}

export function Table({ columns, data, renderCell }: TableProps) {
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
            data.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {renderCell
                      ? renderCell(column.key, row[column.key], row)
                      : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

