'use client';

import { useState, type JSX } from 'react';
import {
  Amount,
  Delta,
  Percent,
  ReportTable,
  type RowVariant,
  type TableCell,
  type TableRow,
} from '@fincore/ui';
import type { PnlDto, PnlRowDto } from '@/lib/api';
import { translator, type Language } from '@/lib/language';
import { DrilldownPanel, type DrilldownRequest } from './DrilldownPanel';
import { formatPeriod } from '@/lib/period';

/** Lines where a rise is bad news: costs, draws, and tax. */
const LOWER_IS_BETTER = new Set([
  'cogs',
  'opexVariable',
  'opexFixed',
  'opexUnclassified',
  'depreciation',
  'interest',
  'tax',
  'dividends',
]);

const variantOf = (row: PnlRowDto): RowVariant => {
  if (row.kind === 'margin') return 'derived';
  if (row.kind === 'subtotal') return row.level === 0 ? 'section' : 'total';
  return 'detail';
};

export interface PnlTableProps {
  readonly report: PnlDto;
  /**
   * The language, not a translator: a function cannot cross the server/client
   * boundary, and the message tables are static strings either side.
   */
  readonly language: Language;
}

export function PnlTable({ report, language }: PnlTableProps): JSX.Element {
  const [open, setOpen] = useState<DrilldownRequest | null>(null);
  const translate = translator(language);
  const hasComparison = report.comparison !== null;

  const columns = [
    `${translate('table.amount')}, ${report.currency}`,
    ...(hasComparison
      ? [`${translate('table.prior')}, ${report.currency}`, translate('table.delta')]
      : []),
  ];

  const rows: TableRow[] = report.rows.map((row) => {
    const label = translate(row.labelKey);
    const amountCell: TableCell =
      row.kind === 'margin'
        ? { content: <Percent value={row.percent} /> }
        : {
            content: <Amount value={row.amount} translate={translate} decimals={0} />,
            onOpen: () => {
              setOpen({ report: 'pnl', line: row.code, label, from: report.from, to: report.to });
            },
            openLabel: `${label}: ${translate('drilldown.title')}`,
          };

    const cells: TableCell[] = [amountCell];
    if (hasComparison) {
      cells.push(
        row.kind === 'margin'
          ? { content: <Percent value={row.priorPercent} /> }
          : { content: <Amount value={row.priorAmount} translate={translate} decimals={0} /> },
        {
          content: (
            <Delta
              value={row.kind === 'margin' ? null : row.deltaPercent}
              higherIsBetter={!LOWER_IS_BETTER.has(row.code)}
            />
          ),
        },
      );
    }

    return {
      key: row.code,
      label,
      indent: row.level === 0 ? 0 : 1,
      variant: variantOf(row),
      cells,
    };
  });

  // A grouped report shows each line's articles or directions beneath it.
  const withBreakdown: TableRow[] = rows.flatMap((row, index) => {
    const source = report.rows[index];
    if (source === undefined || source.breakdown.length === 0) {
      return [row];
    }
    const label = translate(source.labelKey);
    const children: TableRow[] = source.breakdown.map((part, partIndex) => {
      const name =
        [part.directionName, part.articleName].filter((value) => value !== null).join(' · ') || '—';
      const cells: TableCell[] = [
        {
          content: <Amount value={part.amount} translate={translate} decimals={0} />,
          onOpen: () => {
            setOpen({
              report: 'pnl',
              line: source.code,
              label: `${label} · ${name}`,
              from: report.from,
              to: report.to,
              ...(part.articleId === null ? {} : { articleId: part.articleId }),
              ...(part.directionId === null ? {} : { directionId: part.directionId }),
            });
          },
          openLabel: `${label} · ${name}`,
        },
      ];
      if (hasComparison) {
        cells.push(
          { content: <Amount value={part.priorAmount} translate={translate} decimals={0} /> },
          { content: <Delta value={null} higherIsBetter /> },
        );
      }
      return {
        key: `${source.code}-${String(partIndex)}`,
        label: name,
        variant: 'breakdown' as const,
        cells,
      };
    });
    return [row, ...children];
  });

  return (
    <>
      <ReportTable
        rowHeader={translate('table.line')}
        columns={columns}
        rows={withBreakdown}
        {...(report.comparison === null
          ? {}
          : { caption: `${translate('table.prior')}: ${formatPeriod(report.comparison)}` })}
      />
      {open === null ? null : (
        <DrilldownPanel
          request={open}
          language={language}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
