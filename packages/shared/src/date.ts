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

/**
 * Shifts by whole months, clamping the day to the target month's length so
 * 31 January minus one month is 31 December and plus one month is 28 February.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const shifted = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(shifted / 12);
  const targetMonth = (shifted % 12) + 1;
  const clamped = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(
    clamped,
  ).padStart(2, '0')}` as IsoDate;
}

/** Whole months between two dates, ignoring the day of month. */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const fromIndex = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const toIndex = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return toIndex - fromIndex;
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
