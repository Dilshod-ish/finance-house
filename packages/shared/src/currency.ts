/**
 * ISO-4217 alphabetic code. Deliberately not an enum of known currencies:
 * the set of currencies a tenant uses is data, not code, and hardcoding
 * currencies outside a region pack is an anti-pattern (CLAUDE.md §9).
 */
export type CurrencyCode = string & { readonly __brand: 'CurrencyCode' };

const CURRENCY_CODE = /^[A-Z]{3}$/;

export function isCurrencyCode(value: string): value is CurrencyCode {
  return CURRENCY_CODE.test(value);
}

/** Throws on malformed input — a bad literal in code is a programmer error. */
export function currency(value: string): CurrencyCode {
  if (!isCurrencyCode(value)) {
    throw new TypeError(`Invalid ISO-4217 currency code: ${JSON.stringify(value)}`);
  }
  return value;
}
