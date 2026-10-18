'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { Amount, EmptyState, Notice, ReportTable, type TableRow } from '@fincore/ui';
import type { ArticleDto, InboxRowDto, OperationsErrorDto } from '@/lib/api';
import { translator, type Language } from '@/lib/language';

export interface OperationsInboxProps {
  readonly language: Language;
  readonly orgId: string;
  readonly operations: readonly InboxRowDto[];
  readonly articles: readonly ArticleDto[];
}

/**
 * The queue (PRD US-2.2): one row per operation nobody has classified yet,
 * with the article picker on the row itself. Assigning is a correction in the
 * ledger — reverse and re-post — so the row leaves the list once the server
 * confirms, never before.
 */
export function OperationsInbox({
  language,
  orgId,
  operations,
  articles,
}: OperationsInboxProps): JSX.Element {
  const translate = translator(language);
  const router = useRouter();
  const [chosen, setChosen] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function assign(operationId: string): Promise<void> {
    const articleId = chosen[operationId];
    if (articleId === undefined || articleId === '') return;
    setBusy(operationId);
    setRefusal(null);
    const search = new URLSearchParams({ action: 'assign', org: orgId, id: operationId });
    const response = await fetch(`/api/operations?${search.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleId }),
    });
    setBusy(null);
    if (!response.ok) {
      const error = (await response.json()) as OperationsErrorDto;
      setRefusal(error.message);
      return;
    }
    router.refresh();
  }

  if (operations.length === 0) {
    return <EmptyState translate={translate} action={translate('ops.inbox.empty')} />;
  }

  const rows: TableRow[] = operations.map((operation) => ({
    key: operation.id,
    label: (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{operation.cashDate}</span>
        <span className="fc-muted">
          {[operation.counterpartyName, operation.documentNumber, operation.purpose]
            .filter((part) => part !== null && part !== '')
            .join(' · ')}
        </span>
      </div>
    ),
    cells: [
      { content: operation.accountName },
      {
        content: translate(operation.direction === 'in' ? 'ops.direction.in' : 'ops.direction.out'),
      },
      { content: <Amount value={operation.amount} translate={translate} /> },
      {
        content: (
          <select
            className="fc-control"
            value={chosen[operation.id] ?? ''}
            aria-label={translate('ops.inbox.article')}
            onChange={(event) => {
              setChosen((previous) => ({ ...previous, [operation.id]: event.target.value }));
            }}
          >
            <option value="">{translate('ops.inbox.pick')}</option>
            {articles.map((article) => (
              <option key={article.id} value={article.id}>
                {article.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        content: (
          <button
            type="button"
            className="fc-button"
            disabled={busy === operation.id || (chosen[operation.id] ?? '') === ''}
            onClick={() => {
              void assign(operation.id);
            }}
          >
            {translate('ops.inbox.assign')}
          </button>
        ),
      },
    ],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-3)' }}>
      {refusal === null ? null : <Notice tone="danger">{refusal}</Notice>}
      <ReportTable
        rowHeader={translate('ops.inbox.date')}
        columns={[
          translate('ops.inbox.account'),
          translate('ops.inbox.purpose'),
          translate('ops.inbox.amount'),
          translate('ops.inbox.article'),
          '',
        ]}
        rows={rows}
      />
    </div>
  );
}
