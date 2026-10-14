import type { JSX, ReactNode } from 'react';
import type { Translate } from '../format/translate.js';

export interface PanelProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly onClose: () => void;
  readonly translate: Translate;
  readonly children: ReactNode;
}

/**
 * Slides in from the right and leaves the report visible behind it. Not a
 * modal: the reader clicked a figure and must still be able to see which one
 * (design system §9).
 */
export function Panel({ title, subtitle, onClose, translate, children }: PanelProps): JSX.Element {
  return (
    <aside className="fc-panel" aria-label={typeof title === 'string' ? title : undefined}>
      <header className="fc-panel__head">
        <div>
          <p style={{ margin: 0, fontSize: 'var(--fc-text-heading)', fontWeight: 500 }}>{title}</p>
          {subtitle === undefined ? null : (
            <p
              style={{
                margin: 'var(--fc-space-1) 0 0',
                color: 'var(--fc-text-muted)',
                fontSize: 'var(--fc-text-note)',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        <button type="button" className="fc-button" onClick={onClose}>
          {translate('drilldown.close')}
        </button>
      </header>
      <div className="fc-panel__body">{children}</div>
    </aside>
  );
}
