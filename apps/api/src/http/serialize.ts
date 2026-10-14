import type { Money } from '@fincore/shared';

/**
 * Money on the wire. A string, always: `JSON.parse` turns a JSON number into a
 * double, which would silently round a `numeric(20,4)` figure and break I7 at
 * the one place we cannot test for it — the client.
 */
export interface MoneyDto {
  readonly amount: string;
  readonly currency: string;
}

export function money(value: Money): MoneyDto {
  return { amount: value.toStorage(), currency: value.currency };
}

export function maybeMoney(value: Money | null): MoneyDto | null {
  return value === null ? null : money(value);
}
