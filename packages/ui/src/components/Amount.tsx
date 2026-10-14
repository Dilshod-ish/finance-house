import type { JSX } from 'react';
import {
  NO_VALUE,
  amountTone,
  compactAmount,
  deltaTone,
  formatAmount,
  formatDeltaPercent,
  formatPercent,
  joinCompact,
  type Tone,
} from '../format/number.js';
import type { Translate } from '../format/translate.js';

export interface MoneyValue {
  readonly amount: string;
  readonly currency: string;
}

const toneClass = (tone: Tone): string =>
  tone === 'neutral' ? 'fc-amount' : `fc-amount fc-amount--${tone}`;

export interface AmountProps {
  readonly value: MoneyValue | null;
  readonly decimals?: number;
  /** Abbreviate to `412,4 mln`, with the full figure on hover. */
  readonly compact?: boolean;
  readonly translate: Translate;
}

/**
 * One figure. Zero renders as `0,00` and absence as `—`: the design system is
 * explicit that these must not look alike, because "no data" and "nothing
 * happened" are different answers.
 */
export function Amount({ value, decimals, compact, translate }: AmountProps): JSX.Element {
  if (value === null) {
    return <span className="fc-amount fc-amount--muted">{NO_VALUE}</span>;
  }
  const format = decimals === undefined ? {} : { decimals };
  if (compact === true) {
    const scaled = compactAmount(value.amount, format);
    return (
      <span className={toneClass(amountTone(value.amount))} title={scaled.exact}>
        {joinCompact(scaled, translate)}
      </span>
    );
  }
  return (
    <span className={toneClass(amountTone(value.amount))}>
      {formatAmount(value.amount, format)}
    </span>
  );
}

export interface PercentProps {
  readonly value: string | null;
  readonly decimals?: number;
}

export function Percent({ value, decimals }: PercentProps): JSX.Element {
  return <span className="fc-amount">{formatPercent(value, decimals)}</span>;
}

export interface DeltaProps {
  readonly value: string | null;
  /** Whether an increase is good on this line: revenue yes, cost no. */
  readonly higherIsBetter: boolean;
}

/** A delta percentage, coloured by whether it moved the right way. */
export function Delta({ value, higherIsBetter }: DeltaProps): JSX.Element {
  if (value === null) {
    return <span className="fc-amount fc-amount--muted">{NO_VALUE}</span>;
  }
  return (
    <span className={toneClass(deltaTone(value, higherIsBetter))}>{formatDeltaPercent(value)}</span>
  );
}
