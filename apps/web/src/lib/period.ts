/**
 * Period parsing for the screens. Dates are strings throughout: `Date` in a
 * financial UI invites a timezone to shift an accrual date by a day (I6).
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && ISO.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** The month a reader most likely means on a first visit: the demo's last. */
export const DEFAULT_PERIOD = { from: '2026-01-01', to: '2026-03-31' } as const;

export interface Period {
  readonly from: string;
  readonly to: string;
}

export function readPeriod(
  from: string | undefined,
  to: string | undefined,
  fallback: Period = DEFAULT_PERIOD,
): Period {
  return {
    from: isIsoDate(from) ? from : fallback.from,
    to: isIsoDate(to) ? to : fallback.to,
  };
}

export function readAsOf(value: string | undefined, fallback = DEFAULT_PERIOD.to): string {
  return isIsoDate(value) ? value : fallback;
}

/** `01.01.2026 — 31.03.2026`, the separator a CIS reader expects. */
export function formatPeriod(period: Period): string {
  return `${formatDate(period.from)} — ${formatDate(period.to)}`;
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day ?? '??'}.${month ?? '??'}.${year ?? '????'}`;
}
