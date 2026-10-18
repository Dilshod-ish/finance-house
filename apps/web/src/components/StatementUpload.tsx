'use client';

import { useRef, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import { Notice } from '@fincore/ui';
import type { Language, Translate } from '@/lib/language';
import { translator } from '@/lib/language';
import type { ImportResultDto, OperationsErrorDto } from '@/lib/api';

export interface StatementUploadProps {
  readonly language: Language;
  readonly orgId: string;
}

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'done'; readonly result: ImportResultDto }
  | { readonly kind: 'refused'; readonly error: OperationsErrorDto };

/**
 * The upload. It shows what the import did — rows posted, rows left
 * unclassified, rows it had seen before — rather than a bare "done": those
 * three numbers are what tells the person whether to trust the report they
 * are about to read.
 */
export function StatementUpload({ language, orgId }: StatementUploadProps): JSX.Element {
  const translate: Translate = translator(language);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function upload(file: File): Promise<void> {
    setState({ kind: 'working' });
    const search = new URLSearchParams({
      action: 'import',
      org: orgId,
      fileName: file.name,
    });
    const response = await fetch(`/api/operations?${search.toString()}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: await file.arrayBuffer(),
    });
    const payload: unknown = await response.json();
    if (!response.ok) {
      setState({ kind: 'refused', error: payload as OperationsErrorDto });
      return;
    }
    setState({ kind: 'done', result: payload as ImportResultDto });
    // The reports and the inbox both changed; re-render them from the server.
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-3)' }}>
      <label className="fc-field">
        <span>{translate('ops.upload.hint')}</span>
        <input
          ref={input}
          data-testid="statement-file"
          type="file"
          accept=".xlsx"
          className="fc-control"
          disabled={state.kind === 'working'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) {
              void upload(file);
            }
          }}
        />
      </label>

      {state.kind === 'working' ? (
        <Notice tone="warning">{translate('ops.upload.working')}</Notice>
      ) : null}

      {state.kind === 'done' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-2)' }}>
          <Notice tone="success">
            {translate('ops.upload.result', {
              posted: String(state.result.postedCount),
              unassigned: String(state.result.unassignedCount),
              duplicates: String(state.result.duplicates.length),
            })}
          </Notice>
          {state.result.unknownArticles.length === 0 ? null : (
            <Notice tone="warning">
              {translate('ops.upload.unknownArticles')} {state.result.unknownArticles.join(', ')}
            </Notice>
          )}
        </div>
      ) : null}

      {state.kind === 'refused' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--fc-space-2)' }}>
          <Notice tone="danger">{state.error.message}</Notice>
          {(state.error.problems ?? [])
            .filter((problem) => problem.severity === 'error')
            .map((problem, index) => (
              <Notice key={index} tone="danger">
                {[problem.sheet, problem.row === null ? null : String(problem.row), problem.column]
                  .filter((part) => part !== null && part !== '')
                  .join(' · ')}
                {' — '}
                {problem.message[language]}
              </Notice>
            ))}
        </div>
      ) : null}
    </div>
  );
}
