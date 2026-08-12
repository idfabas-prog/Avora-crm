import Link from "next/link";

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  getRowHref?: (row: T) => string;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getRowHref
}: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const cells = columns.map((column) => (
              <td key={String(column.key)}>
                {column.render ? column.render(row) : String(row[column.key] ?? "")}
              </td>
            ));
            const key = getRowHref?.(row) ?? index;

            return (
              <tr key={key}>
                {getRowHref ? (
                  <td colSpan={columns.length}>
                    <Link className="table-row-link" href={getRowHref(row)}>
                      <table>
                        <tbody>
                          <tr>{cells}</tr>
                        </tbody>
                      </table>
                    </Link>
                  </td>
                ) : (
                  cells
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
