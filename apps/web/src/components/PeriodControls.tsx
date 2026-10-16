import type { JSX } from 'react';
import type { Language, Translate } from '@/lib/language';

export interface PeriodControlsProps {
  readonly translate: Translate;
  readonly language: Language;
  readonly from: string;
  readonly to: string;
  readonly grouping?: string;
  /** Which groupings this report offers; they differ per report. */
  readonly groupings?: readonly string[];
  readonly compare?: boolean;
}

/**
 * A plain GET form. No client state and no JavaScript needed: the period lives
 * in the URL, so a view is shareable and the back button works — and a reader
 * who types 200 operations a day can tab straight through it (design system
 * §7.5, keyboard first).
 */
export function PeriodControls({
  translate,
  language,
  from,
  to,
  grouping,
  groupings = ['none', 'article', 'direction', 'direction_article'],
  compare,
}: PeriodControlsProps): JSX.Element {
  return (
    <form method="get" className="shell__controls">
      <input type="hidden" name="lang" value={language} />
      <label className="fc-field">
        <span>{translate('period.from')}</span>
        <input type="date" name="from" defaultValue={from} className="fc-control" />
      </label>
      <label className="fc-field">
        <span>{translate('period.to')}</span>
        <input type="date" name="to" defaultValue={to} className="fc-control" />
      </label>
      {grouping === undefined ? null : (
        <label className="fc-field">
          <span>{translate('grouping.label')}</span>
          <select name="grouping" defaultValue={grouping} className="fc-control">
            {groupings.map((option) => (
              <option key={option} value={option}>
                {translate(`grouping.${option}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      {compare === undefined ? null : (
        <label
          className="fc-field"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 'var(--fc-space-2)' }}
        >
          <input type="checkbox" name="compare" value="1" defaultChecked={compare} />
          <span style={{ fontSize: 'var(--fc-text-aux)', color: 'var(--fc-text-secondary)' }}>
            {translate('period.comparePrior')}
          </span>
        </label>
      )}
      <button type="submit" className="fc-button fc-button--accent">
        OK
      </button>
    </form>
  );
}

export interface AsOfControlsProps {
  readonly translate: Translate;
  readonly language: Language;
  readonly asOf: string;
}

export function AsOfControls({ translate, language, asOf }: AsOfControlsProps): JSX.Element {
  return (
    <form method="get" className="shell__controls">
      <input type="hidden" name="lang" value={language} />
      <label className="fc-field">
        <span>{translate('period.asOf')}</span>
        <input type="date" name="asOf" defaultValue={asOf} className="fc-control" />
      </label>
      <button type="submit" className="fc-button fc-button--accent">
        OK
      </button>
    </form>
  );
}
