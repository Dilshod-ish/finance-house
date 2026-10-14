import type { JSX, ReactNode } from 'react';

/**
 * The product's main component (design system §9): sticky header, sticky label
 * column, hierarchy by indent, totals set apart by weight and background
 * rather than colour, and every figure clickable.
 *
 * It takes already-formatted cells. Deciding what a number means is the
 * report's job, and formatting it is `Amount`'s; this only lays them out.
 */

export type RowVariant = 'detail' | 'section' | 'total' | 'derived' | 'breakdown';

export interface TableCell {
  readonly content: ReactNode;
  /** Opens the drill-down. Omitted where a figure has no lines behind it. */
  readonly onOpen?: () => void;
  readonly openLabel?: string;
}

export interface TableRow {
  readonly key: string;
  readonly label: ReactNode;
  readonly indent?: 0 | 1 | 2;
  readonly variant?: RowVariant;
  readonly cells: readonly TableCell[];
}

export interface ReportTableProps {
  /** Column headings. The currency belongs here, not in every cell. */
  readonly columns: readonly ReactNode[];
  readonly rowHeader: ReactNode;
  readonly rows: readonly TableRow[];
  readonly caption?: string;
}

const rowClass = (variant: RowVariant): string =>
  variant === 'detail' ? '' : `fc-row--${variant}`;

const indentClass = (indent: 0 | 1 | 2): string => (indent === 0 ? '' : `fc-indent-${indent}`);

export function ReportTable({ columns, rowHeader, rows, caption }: ReportTableProps): JSX.Element {
  return (
    <div className="fc-table-scroll">
      <table className="fc-table">
        {caption === undefined ? null : (
          <caption className="fc-state__body" style={{ captionSide: 'top', textAlign: 'left' }}>
            {caption}
          </caption>
        )}
        <thead>
          <tr>
            <th scope="col">{rowHeader}</th>
            {columns.map((column, index) => (
              <th key={index} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={rowClass(row.variant ?? 'detail')}>
              <th scope="row" className={indentClass(row.indent ?? 0)}>
                {row.label}
              </th>
              {row.cells.map((cell, index) => (
                <td key={index}>
                  {cell.onOpen === undefined ? (
                    cell.content
                  ) : (
                    <button
                      type="button"
                      className="fc-cell-button"
                      onClick={cell.onOpen}
                      aria-label={cell.openLabel}
                    >
                      {cell.content}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
