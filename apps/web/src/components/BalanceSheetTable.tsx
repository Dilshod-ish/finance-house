'use client';

import { useState, type JSX } from 'react';
import { Amount, ReportTable, type TableRow } from '@fincore/ui';
import type { BalanceSheetDto } from '@/lib/api';
import { translator, type Language } from '@/lib/language';
import { DrilldownPanel, type DrilldownRequest } from './DrilldownPanel';

export interface BalanceSheetTableProps {
  readonly report: BalanceSheetDto;
  /** The language, not a translator — a function cannot cross the boundary. */
  readonly language: Language;
  readonly orgId: string;
  readonly side: 'assets' | 'liabilities_and_equity';
}

export function BalanceSheetTable({
  report,
  language,
  orgId,
  side,
}: BalanceSheetTableProps): JSX.Element {
  const [open, setOpen] = useState<DrilldownRequest | null>(null);
  const translate = translator(language);

  const rows: TableRow[] = report.lines
    .filter((line) => line.side === side)
    .map((line) => {
      const label = translate(line.labelKey);
      return {
        key: line.code,
        label,
        indent: line.level === 0 ? 0 : line.level === 1 ? 1 : 2,
        variant: line.level === 0 ? 'section' : line.isTotal ? 'total' : 'detail',
        cells: [
          {
            content: <Amount value={line.amount} translate={translate} decimals={0} />,
            // A balance-sheet figure is cumulative, so no lower bound is sent.
            ...(line.isDrillable
              ? {
                  onOpen: () => {
                    setOpen({
                      report: 'balance-sheet',
                      line: line.code,
                      label,
                      to: report.asOf,
                    });
                  },
                  openLabel: `${label}: ${translate('drilldown.title')}`,
                }
              : {}),
          },
        ],
      };
    });

  return (
    <>
      <ReportTable
        rowHeader={translate('table.line')}
        columns={[`${translate('table.amount')}, ${report.currency}`]}
        rows={rows}
      />
      {open === null ? null : (
        <DrilldownPanel
          request={open}
          language={language}
          orgId={orgId}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}
