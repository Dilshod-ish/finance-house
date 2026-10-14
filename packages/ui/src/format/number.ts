import { Decimal, type Language } from '@fincore/shared';

/**
 * Number formatting for a financial interface, per the design system §8. These
 * are not cosmetic rules: a thousands separator that shifts, or a column where
 * digits do not line up, is what makes a report unreadable.
 *
 * Rounding happens here and nowhere else (CLAUDE.md §5). Every function takes
 * the storage string — a `numeric(20,4)` value — and never a `number`.
 */

/** Narrow no-break space: groups never break across lines, and nor does a unit suffix. */
const GROUP_SEPARATOR = '\u202f';
const DECIMAL_SEPARATOR = ',';

/** Shown when there is no figure at all, as distinct from a figure of zero. */
export const NO_VALUE = '—';

/**
 * How many decimals a currency shows is a property of the currency, so the
 * region pack owns it (CLAUDE.md §4). Two is the fallback until it does.
 */
const DEFAULT_DECIMALS = 2;

export interface AmountFormat {
  readonly decimals?: number;
  /** Always show a sign, for a delta column where direction is the point. */
  readonly signed?: boolean;
}

function group(digits: string): string {
  let out = '';
  for (let i = digits.length; i > 0; i -= 3) {
    const chunk = digits.slice(Math.max(0, i - 3), i);
    out = out === '' ? chunk : `${chunk}${GROUP_SEPARATOR}${out}`;
  }
  return out;
}

/**
 * `1 709 505 612,50`. Negative values carry a minus sign, never parentheses:
 * the design system is explicit that a CIS reader does not read brackets as
 * negative.
 */
export function formatAmount(value: string, format: AmountFormat = {}): string {
  const decimals = format.decimals ?? DEFAULT_DECIMALS;
  const rounded = new Decimal(value).toFixed(decimals);
  const isNegative = rounded.startsWith('-');
  const [whole = '0', fraction] = rounded.replace('-', '').split('.');

  const sign = isNegative ? '-' : format.signed === true ? '+' : '';
  const body =
    fraction === undefined ? group(whole) : `${group(whole)}${DECIMAL_SEPARATOR}${fraction}`;
  return `${sign}${body}`;
}

/** Thresholds and their locale keys, largest first. */
const SCALES = [
  { at: '1000000000000', divisor: '1000000000000', key: 'unit.trillion' },
  { at: '1000000000', divisor: '1000000000', key: 'unit.billion' },
  { at: '1000000', divisor: '1000000', key: 'unit.million' },
  { at: '1000', divisor: '1000', key: 'unit.thousand' },
] as const;

export type UnitKey = (typeof SCALES)[number]['key'];

export interface CompactAmount {
  /** `1,71` — already divided and rounded. */
  readonly value: string;
  /** The locale key for the suffix, or null when none was applied. */
  readonly unitKey: UnitKey | null;
  /** The full figure, for the hover title the design system requires. */
  readonly exact: string;
}

/**
 * `412,4 mln`. Returns the parts rather than a finished string, because the
 * suffix is a locale key and this package does not decide what language the
 * reader wants (CLAUDE.md §9 — no localized text outside the message table).
 */
export function compactAmount(value: string, format: AmountFormat = {}): CompactAmount {
  const exact = formatAmount(value, format);
  const magnitude = new Decimal(value).abs();

  for (const scale of SCALES) {
    if (magnitude.greaterThanOrEqualTo(scale.at)) {
      const scaled = new Decimal(value).dividedBy(scale.divisor);
      return {
        value: formatAmount(scaled.toFixed(4), { decimals: scaled.abs().lessThan(10) ? 2 : 1 }),
        unitKey: scale.key,
        exact,
      };
    }
  }
  return { value: exact, unitKey: null, exact };
}

/** `96,7%`, or `—` when the report had no base to divide by. */
export function formatPercent(value: string | null, decimals = 1): string {
  if (value === null) {
    return NO_VALUE;
  }
  return `${formatAmount(value, { decimals })}%`;
}

/** `+12,4%` — a delta percentage, where the sign is the message. */
export function formatDeltaPercent(value: string | null, decimals = 1): string {
  if (value === null) {
    return NO_VALUE;
  }
  return `${formatAmount(value, { decimals, signed: true })}%`;
}

export type Tone = 'neutral' | 'danger' | 'success';

/**
 * Colour carries meaning or nothing (design system §7.4): negative money is
 * `danger` because it is money lost, and everything else stays neutral. A
 * positive figure is not painted green just for being positive.
 */
export function amountTone(value: string): Tone {
  return new Decimal(value).isNegative() ? 'danger' : 'neutral';
}

/**
 * For a delta, direction is the meaning, but which direction is good depends on
 * the line: revenue up is good, cost up is not. The caller says which.
 */
export function deltaTone(value: string, higherIsBetter: boolean): Tone {
  const decimal = new Decimal(value);
  if (decimal.isZero()) {
    return 'neutral';
  }
  return decimal.isPositive() === higherIsBetter ? 'success' : 'danger';
}

/** Formats one language's suffix onto a compact amount. */
export function joinCompact(compact: CompactAmount, translate: (key: string) => string): string {
  return compact.unitKey === null
    ? compact.value
    : `${compact.value}${GROUP_SEPARATOR}${translate(compact.unitKey)}`;
}

/** The languages a compact suffix must exist in — re-exported for the audit. */
export type { Language };
