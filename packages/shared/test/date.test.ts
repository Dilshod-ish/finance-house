import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  monthsBetween,
  compareIsoDate,
  endOfMonth,
  fromUtcDate,
  isIsoDate,
  isoDate,
  monthKey,
  startOfMonth,
  toUtcDate,
} from '../src/date.js';

describe('IsoDate', () => {
  it('validates real calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-00-01')).toBe(false);
    expect(isIsoDate('2026-01-00')).toBe(false);
    expect(isIsoDate('2026-1-1')).toBe(false);
    expect(() => isoDate('nope')).toThrow(TypeError);
  });

  it('round-trips through UTC without shifting the day', () => {
    const d = isoDate('2026-03-01');
    expect(fromUtcDate(toUtcDate(d))).toBe(d);
    expect(toUtcDate(d).getUTCHours()).toBe(0);
  });

  it('compares chronologically', () => {
    expect(compareIsoDate(isoDate('2026-01-01'), isoDate('2026-02-01'))).toBe(-1);
    expect(compareIsoDate(isoDate('2026-02-01'), isoDate('2026-01-01'))).toBe(1);
    expect(compareIsoDate(isoDate('2026-01-01'), isoDate('2026-01-01'))).toBe(0);
  });

  it('walks days across month and year boundaries', () => {
    expect(addDays(isoDate('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(isoDate('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('shifts whole months, clamping the day to the target month', () => {
    expect(addMonths(isoDate('2026-01-31'), 1)).toBe('2026-02-28');
    expect(addMonths(isoDate('2026-01-31'), -1)).toBe('2025-12-31');
    expect(addMonths(isoDate('2026-03-15'), 0)).toBe('2026-03-15');
    expect(addMonths(isoDate('2026-12-01'), 1)).toBe('2027-01-01');
    expect(addMonths(isoDate('2026-01-01'), -1)).toBe('2025-12-01');
    expect(addMonths(isoDate('2024-01-31'), 1)).toBe('2024-02-29');
  });

  it('counts whole months between two dates', () => {
    expect(monthsBetween(isoDate('2026-01-01'), isoDate('2026-03-31'))).toBe(2);
    expect(monthsBetween(isoDate('2026-03-01'), isoDate('2026-03-31'))).toBe(0);
    expect(monthsBetween(isoDate('2025-11-01'), isoDate('2026-02-01'))).toBe(3);
    expect(monthsBetween(isoDate('2026-03-01'), isoDate('2026-01-01'))).toBe(-2);
  });

  it('derives period boundaries', () => {
    expect(monthKey(isoDate('2026-03-17'))).toBe('2026-03');
    expect(startOfMonth(isoDate('2026-03-17'))).toBe('2026-03-01');
    expect(endOfMonth(isoDate('2026-02-17'))).toBe('2026-02-28');
    expect(endOfMonth(isoDate('2024-02-01'))).toBe('2024-02-29');
    expect(endOfMonth(isoDate('2026-12-01'))).toBe('2026-12-31');
  });
});
