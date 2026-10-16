import { Decimal, addDays, type IsoDate } from '@fincore/shared';
import { SHOWCASE_WINDOW } from './profiles.js';

/**
 * Exchange rates for the showcase period, anchored to published figures and
 * linearly interpolated between them.
 *
 * The anchors are real. The days between them are not the official fixings —
 * no daily series was reachable from this environment — so a rate here is
 * within the published band but is not the Central Bank's number for that
 * date. For testing a ledger that is the right trade-off: what the FX
 * machinery has to survive is a rate that moves, in the right range.
 *
 * UZS per USD, Central Bank of Uzbekistan official rate, as reported by
 * zamin.uz for the dates shown. EUR/USD from poundsterlinglive and valutafx
 * for the dates shown.
 */

interface Anchor {
  readonly on: IsoDate;
  readonly rate: string;
}

/** UZS per 1 USD. */
const UZS_PER_USD: readonly Anchor[] = [
  { on: '2026-01-01' as IsoDate, rate: '11940.00' },
  { on: '2026-01-06' as IsoDate, rate: '11952.24' },
  { on: '2026-03-17' as IsoDate, rate: '12091.22' },
  { on: '2026-05-07' as IsoDate, rate: '12074.28' },
  { on: '2026-05-18' as IsoDate, rate: '11986.30' },
  { on: '2026-06-03' as IsoDate, rate: '11934.64' },
  { on: '2026-06-08' as IsoDate, rate: '12049.44' },
  { on: '2026-06-30' as IsoDate, rate: '12005.00' },
];

/** USD per 1 EUR. */
const USD_PER_EUR: readonly Anchor[] = [
  { on: '2026-01-01' as IsoDate, rate: '1.1550' },
  { on: '2026-01-15' as IsoDate, rate: '1.1600' },
  { on: '2026-01-27' as IsoDate, rate: '1.2019' },
  { on: '2026-02-23' as IsoDate, rate: '1.1800' },
  { on: '2026-06-01' as IsoDate, rate: '1.1633' },
  { on: '2026-06-08' as IsoDate, rate: '1.1533' },
  { on: '2026-06-15' as IsoDate, rate: '1.1587' },
  { on: '2026-06-24' as IsoDate, rate: '1.1356' },
  { on: '2026-06-30' as IsoDate, rate: '1.1400' },
];

const dayNumber = (on: IsoDate): number => Math.round(Date.parse(`${on}T00:00:00Z`) / 86_400_000);

function interpolate(anchors: readonly Anchor[], on: IsoDate): Decimal {
  const day = dayNumber(on);
  let previous = anchors[0];
  if (previous === undefined) {
    throw new Error('rate series has no anchors');
  }
  for (const anchor of anchors) {
    const at = dayNumber(anchor.on);
    if (at === day) {
      return new Decimal(anchor.rate);
    }
    if (at > day) {
      const from = dayNumber(previous.on);
      if (at === from) {
        return new Decimal(anchor.rate);
      }
      const weight = new Decimal(day - from).dividedBy(at - from);
      const start = new Decimal(previous.rate);
      return start.plus(new Decimal(anchor.rate).minus(start).times(weight));
    }
    previous = anchor;
  }
  return new Decimal(previous.rate);
}

/** Units of USD per one unit of `currency` — what a journal line carries. */
export function usdPerUnit(currency: string, on: IsoDate): Decimal {
  switch (currency) {
    case 'USD':
      return new Decimal('1');
    case 'UZS':
      return new Decimal('1').dividedBy(interpolate(UZS_PER_USD, on));
    case 'EUR':
      return interpolate(USD_PER_EUR, on);
    default:
      throw new Error(`showcase has no rate for ${currency}`);
  }
}

export const SHOWCASE_CURRENCIES = ['USD', 'UZS', 'EUR'] as const;
export type ShowcaseCurrency = (typeof SHOWCASE_CURRENCIES)[number];

export interface FxRateRow {
  readonly orgId: string;
  readonly asOfDate: string;
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly rate: string;
  readonly source: string;
}

/** A row per non-functional currency per day, as `fx_rate` stores them. */
export function showcaseFxRows(orgId: string, source: string): FxRateRow[] {
  const rows: FxRateRow[] = [];
  // One day early: the opening balance is dated the day before the window.
  let day: IsoDate = addDays(SHOWCASE_WINDOW.from, -1);
  while (day <= SHOWCASE_WINDOW.to) {
    for (const currency of ['UZS', 'EUR'] as const) {
      rows.push({
        orgId,
        asOfDate: day,
        baseCurrency: currency,
        quoteCurrency: 'USD',
        rate: usdPerUnit(currency, day).toFixed(10),
        source,
      });
    }
    day = addDays(day, 1);
  }
  return rows;
}
