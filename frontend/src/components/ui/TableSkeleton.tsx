import '@/shared/ui/Table/Table.css'
import './TableSkeleton.css'

export interface TableSkeletonProps {
  /** Number of columns (default 5) to match real table and avoid layout shift */
  columnCount?: number
  /** Number of skeleton rows (default 5) */
  rowCount?: number
}

const DEFAULT_COLUMN_COUNT = 5
const DEFAULT_ROW_COUNT = 5

export function TableSkeleton({
  columnCount = DEFAULT_COLUMN_COUNT,
  rowCount = DEFAULT_ROW_COUNT,
}: TableSkeletonProps) {
  return (
    <div className="table-wrapper table-skeleton">
      <table className="table">
        <thead>
          <tr>
            {Array.from({ length: columnCount }, (_, i) => (
              <th key={i}>
                <div className="table-skeleton__cell" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columnCount }, (_, colIndex) => (
                <td key={colIndex}>
                  <div className="table-skeleton__cell" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
