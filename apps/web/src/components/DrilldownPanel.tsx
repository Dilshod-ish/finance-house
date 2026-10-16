'use client';

import { useEffect, useState, type JSX } from 'react';
import { Amount, Panel } from '@fincore/ui';
import type { LedgerLineDto } from '@/lib/api';
import { formatDate } from '@/lib/period';
import { translator, type Language } from '@/lib/language';

export interface DrilldownRequest {
  readonly report: 'pnl' | 'balance-sheet' | 'cash-flow';
  readonly line: string;
  readonly label: string;
  readonly from?: string;
  readonly to: string;
  readonly articleId?: string;
  readonly directionId?: string;
}

export interface DrilldownPanelProps {
  readonly request: DrilldownRequest;
  readonly language: Language;
  readonly orgId: string;
  readonly onClose: () => void;
}

const LIMIT = 500;

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly lines: readonly LedgerLineDto[] }
  | { readonly status: 'error' };

/**
 * The first of the three clicks I3 promises: from a figure to the entries
 * behind it, each carrying its source marker. Loads through a Next route
 * handler, so the tenant header stays on the server.
 */
export function DrilldownPanel({
  request,
  language,
  orgId,
  onClose,
}: DrilldownPanelProps): JSX.Element {
  const [state, setState] = useState<State>({ status: 'loading' });
  const translate = translator(language);

  useEffect(() => {
    const controller = new AbortController();
    const search = new URLSearchParams({
      report: request.report,
      line: request.line,
      to: request.to,
      org: orgId,
      limit: String(LIMIT),
    });
    if (request.from !== undefined) search.set('from', request.from);
    if (request.articleId !== undefined) search.set('articleId', request.articleId);
    if (request.directionId !== undefined) search.set('directionId', request.directionId);

    setState({ status: 'loading' });
    fetch(`/api/drilldown?${search.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`drilldown answered ${String(response.status)}`);
        }
        const body = (await response.json()) as { lines: readonly LedgerLineDto[] };
        setState({ status: 'ready', lines: body.lines });
      })
      .catch((error: unknown) => {
        // An aborted request is this component unmounting, not a failure.
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      controller.abort();
    };
  }, [request, orgId]);

  return (
    <Panel
      title={request.label}
      subtitle={translate('drilldown.title')}
      onClose={onClose}
      translate={translate}
    >
      {state.status === 'loading' ? <p>{translate('state.loading')}…</p> : null}
      {state.status === 'error' ? <p role="alert">{translate('state.error.title')}</p> : null}
      {state.status === 'ready' ? (
        <>
          {state.lines.length === LIMIT ? (
            <p className="fc-notice" style={{ marginBottom: 'var(--fc-space-3)' }}>
              {translate('drilldown.capped', { limit: String(LIMIT) })}
            </p>
          ) : null}
          <table className="fc-table" data-testid="drilldown-table">
            <thead>
              <tr>
                <th scope="col">{translate('drilldown.date')}</th>
                <th scope="col">{translate('drilldown.source')}</th>
                <th scope="col">{translate('drilldown.account')}</th>
                <th scope="col">{translate('drilldown.article')}</th>
                <th scope="col">{translate('drilldown.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {state.lines.map((line, index) => (
                <tr key={`${line.entryId}-${String(index)}`}>
                  <th scope="row">{formatDate(line.accrualDate)}</th>
                  {/* I3: source_type and source_id, on every line. */}
                  <td style={{ textAlign: 'left' }}>
                    {line.sourceType}
                    {line.sourceId === null ? '' : ` · ${line.sourceId.slice(0, 8)}`}
                  </td>
                  <td style={{ textAlign: 'left' }}>{line.glCode}</td>
                  <td style={{ textAlign: 'left' }}>{line.articleName ?? '—'}</td>
                  <td>
                    {line.side === 'D' ? 'D ' : 'C '}
                    <Amount value={line.amountFunctional} translate={translate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </Panel>
  );
}
