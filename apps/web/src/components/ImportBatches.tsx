'use client';

import { useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState, Notice, ReportTable, type TableRow } from '@fincore/ui';
import type { BatchSummaryDto, OperationsErrorDto } from '@/lib/api';
import { translator, type Language } from '@/lib/language';

export interface ImportBatchesProps {
  readonly language: Language;
  readonly orgId: string;
  readonly batches: readonly BatchSummaryDto[];
}

/**
 * What each upload did, and the undo. Reverting asks for a reason because the
 * reason is what the reversal carries into the ledger (`reversal_reason`) —
 * the audit trail is the point, not a confirmation dialog.
 */
export function ImportBatches({ language, orgId, batches }: ImportBatchesProps): JSX.Element {
  const translate = translator(language);
  const router = useRouter();
  const [reason, setReason] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function revert(batchId: string): Promise<void> {
    const why = reason[batchId];
    if (why === undefined || why.trim() === '') return;
    setBusy(batchId);
    setRefusal(null);
    const search = new URLSearchParams({ action: 'revert', org: orgId, id: batchId });
    const response = await fetch(`/api/operations?${search.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: why }),
    });
    setBusy(null);
    if (!response.ok) {
      const error = (await response.json()) as OperationsErrorDto;
      setRefusal(error.message);
      return;
    }
    router.refresh();
  }

  if (batches.length === 0) {
    return <EmptyState translate={translate} action={translate('ops.batches.empty')} />;
  }

  const rows: TableRow[] = batches.map((batch) => ({
    key: batch.id,
    label: (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span>{batch.fileName}</span>
        <span className="fc-muted">
          {batch.createdAt.slice(0, 16).replace('T', ' ')} · {batch.accountName}
        </span>
      </div>
    ),
    variant: batch.status === 'reverted' ? 'breakdown' : 'detail',
    cells: [
      { content: String(batch.rowCount) },
      { content: String(batch.postedCount) },
      { content: String(batch.duplicateCount) },
      {
        content: translate(
          batch.status === 'reverted' ? 'ops.batches.reverted' : 'ops.batches.imported',
        ),
      },
      {
        content:
          batch.status === 'reverted' ? null : (
            <span style={{ display: 'flex', gap: 'var(--fc-space-2)' }}>
              <input
                className="fc-control"
                placeholder={translate('ops.batches.revertReason')}
                aria-label={translate('ops.batches.revertReason')}
                value={reason[batch.id] ?? ''}
                onChange={(event) => {
                  setReason((previous) => ({ ...previous, [batch.id]: event.target.value }));
                }}
              />
              <button
                type="button"
                className="fc-button"
                disabled={busy === batch.id || (reason[batch.id] ?? '').trim() === ''}
                onClick={() => {
                  void revert(batch.id);
                }}
              >
                {translate('ops.batches.revert')}
              </button>
            </span>
          ),
      },
    ],
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-3)' }}>
      {refusal === null ? null : <Notice tone="danger">{refusal}</Notice>}
      <ReportTable
        rowHeader={translate('ops.batches.file')}
        columns={[
          translate('ops.batches.rows'),
          translate('ops.batches.posted'),
          translate('ops.batches.duplicates'),
          translate('ops.batches.status'),
          '',
        ]}
        rows={rows}
      />
    </div>
  );
}
