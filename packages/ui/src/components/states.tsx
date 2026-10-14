import type { JSX, ReactNode } from 'react';
import type { Translate } from '../format/translate.js';

/**
 * The four states every screen owes the reader (design system §11). They are
 * components rather than conventions so that a screen cannot quietly skip one.
 */

export interface SkeletonTableProps {
  readonly rows?: number;
  readonly columns?: number;
}

/** A skeleton, never a spinner: the figures' space is held so nothing jumps. */
export function SkeletonTable({ rows = 12, columns = 3 }: SkeletonTableProps): JSX.Element {
  return (
    <div className="fc-table-scroll" aria-busy="true">
      <table className="fc-table">
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row}>
              <th scope="row" style={{ width: '40%' }}>
                <span className="fc-skeleton" style={{ width: `${40 + ((row * 7) % 50)}%` }} />
              </th>
              {Array.from({ length: columns }, (_, column) => (
                <td key={column}>
                  <span className="fc-skeleton" style={{ width: '70%' }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface EmptyStateProps {
  readonly translate: Translate;
  /** What to do next — an empty screen that only says "no data" is a dead end. */
  readonly action?: ReactNode;
}

export function EmptyState({ translate, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="fc-state">
      <p className="fc-state__title">{translate('state.empty.title')}</p>
      <p className="fc-state__body">{translate('state.empty.body')}</p>
      {action === undefined ? null : <div style={{ marginTop: 'var(--fc-space-4)' }}>{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  readonly translate: Translate;
  readonly action?: ReactNode;
}

/** Says what happened and what to do. The technical message is not shown. */
export function ErrorState({ translate, action }: ErrorStateProps): JSX.Element {
  return (
    <div className="fc-state" role="alert">
      <p className="fc-state__title">{translate('state.error.title')}</p>
      <p className="fc-state__body">{translate('state.error.body')}</p>
      {action === undefined ? null : <div style={{ marginTop: 'var(--fc-space-4)' }}>{action}</div>}
    </div>
  );
}

export interface NoticeProps {
  readonly tone?: 'warning' | 'danger' | 'success';
  readonly children: ReactNode;
}

/**
 * The incomplete state, which is the one most often forgotten: the report is
 * shown, with the caveat beside it. Never hidden, never left unsaid.
 */
export function Notice({ tone = 'warning', children }: NoticeProps): JSX.Element {
  const className = tone === 'warning' ? 'fc-notice' : `fc-notice fc-notice--${tone}`;
  return (
    <div className={className} role={tone === 'danger' ? 'alert' : 'status'}>
      <div>{children}</div>
    </div>
  );
}
