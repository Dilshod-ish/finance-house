/**
 * Calendar dates as `YYYY-MM-DD` strings. I6 depends on `accrual_date` and
 * `cash_date` being real calendar dates: timezone-shifted `Date` objects have
 * silently moved entries into the wrong period in every system that used them.
 */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return false;
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  return day <= daysInMonth(year, month);
}

/** Throws on malformed input — a bad date literal in code is a programmer error. */
export function isoDate(value: string): IsoDate {
  if (!isIsoDate(value)) {
    throw new TypeError(`Invalid ISO date: ${JSON.stringify(value)}`);
  }
  return value;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function fromUtcDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}

export function toUtcDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/** Lexicographic comparison is chronological for `YYYY-MM-DD`. */
export function compareIsoDate(left: IsoDate, right: IsoDate): -1 | 0 | 1 {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const base = toUtcDate(date);
  base.setUTCDate(base.getUTCDate() + days);
  return fromUtcDate(base);
}

/** `YYYY-MM` — the period key used by locks, budgets and monthly reports. */
export type MonthKey = string & { readonly __brand: 'MonthKey' };

export function monthKey(date: IsoDate): MonthKey {
  return date.slice(0, 7) as MonthKey;
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01` as IsoDate;
}

export function endOfMonth(date: IsoDate): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, '0')}` as IsoDate;
}
