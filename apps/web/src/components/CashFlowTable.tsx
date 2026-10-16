'use client';

import { useState, type JSX } from 'react';
import { Amount, ReportTable, type RowVariant, type TableCell, type TableRow } from '@fincore/ui';
import type { CashFlowDto, CashFlowRowDto } from '@/lib/api';
import { translator, type Language } from '@/lib/language';
import { DrilldownPanel, type DrilldownRequest } from './DrilldownPanel';

const variantOf = (row: CashFlowRowDto): RowVariant => {
  if (row.kind === 'balance') return 'total';
  if (row.kind === 'non_cash') return 'derived';
  return row.level === 0 ? 'section' : 'detail';
};

/** The month a column covers, as the first and last day the API would accept. */
function monthRange(period: string): { from: string; to: string } {
  const [year = '0', month = '01'] = period.split('-');
  const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, '0')}` };
}

export interface CashFlowTableProps {
  readonly report: CashFlowDto;
  readonly language: Language;
}

export function CashFlowTable({ report, language }: CashFlowTableProps): JSX.Element {
  const [open, setOpen] = useState<DrilldownRequest | null>(null);
  const translate = translator(language);

  const columns = [
    ...report.periods.map((period) => period),
    `${translate('table.total')}, ${report.currency}`,
  ];

  const cellsFor = (
    row: CashFlowRowDto,
    label: string,
    extra: Partial<DrilldownRequest> = {},
  ): TableCell[] => {
    const openAt = (from: string, to: string, when: string): (() => void) | undefined =>
      row.isDrillable
        ? () => {
            setOpen({
              report: 'cash-flow',
              line: row.code,
              label: `${label} · ${when}`,
              from,
              to,
              ...extra,
            });
          }
        : undefined;

    const monthly = report.periods.map((period, index): TableCell => {
      const range = monthRange(period);
      const onOpen = openAt(range.from, range.to, period);
      return {
        content: <Amount value={row.amounts[index] ?? null} translate={translate} decimals={0} />,
        ...(onOpen === undefined ? {} : { onOpen, openLabel: `${label} · ${period}` }),
      };
    });

    const whole = openAt(report.from, report.to, `${report.from} — ${report.to}`);
    monthly.push({
      content: <Amount value={row.total} translate={translate} decimals={0} />,
      ...(whole === undefined ? {} : { onOpen: whole, openLabel: label }),
    });
    return monthly;
  };

  const rows: TableRow[] = report.rows.flatMap((row) => {
    const label = translate(row.labelKey);
    const main: TableRow = {
      key: row.code,
      label,
      indent: row.level === 0 ? 0 : 1,
      variant: variantOf(row),
      cells: cellsFor(row, label),
    };

    const children: TableRow[] = row.breakdown.map((part) => {
      const name = part.label ?? '—';
      return {
        key: `${row.code}-${part.key}`,
        label: name,
        variant: 'breakdown' as const,
        cells: cellsFor(row, `${label} · ${name}`, {
          ...(part.articleId === null ? {} : { articleId: part.articleId }),
          ...(part.directionId === null ? {} : { directionId: part.directionId }),
        }).map((cell, index) => ({
          ...cell,
          content: (
            <Amount
              value={index < report.periods.length ? (part.amounts[index] ?? null) : part.total}
              translate={translate}
              decimals={0}
            />
          ),
        })),
      };
    });

    return [main, ...children];
  });

  return (
    <>
      <ReportTable rowHeader={translate('table.line')} columns={columns} rows={rows} />
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
