import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money } from '../src/money.js';
import { currency, isCurrencyCode } from '../src/currency.js';
import { Decimal } from '../src/decimal.js';

const UZS = currency('UZS');
const USD = currency('USD');

describe('currency', () => {
  it('accepts ISO-4217 alphabetic codes', () => {
    expect(isCurrencyCode('UZS')).toBe(true);
    expect(isCurrencyCode('uzs')).toBe(false);
    expect(isCurrencyCode('UZSX')).toBe(false);
    expect(() => currency('nope')).toThrow(TypeError);
  });
});

describe('Money', () => {
  it('keeps exact decimal arithmetic where float does not', () => {
    const a = Money.of('0.1', UZS);
    const b = Money.of('0.2', UZS);
    expect(a.plus(b).toStorage()).toBe('0.3000');
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('rounds only at the storage boundary', () => {
    const third = Money.of('1', UZS).dividedBy('3');
    expect(third.value.toFixed(10)).toBe('0.3333333333');
    expect(third.toStorage()).toBe('0.3333');
    expect(third.times('3').toStorage()).toBe('1.0000');
    expect(third.round().times('3').toStorage()).toBe('0.9999');
  });

  it('refuses to mix currencies', () => {
    const uzs = Money.of('100', UZS);
    const usd = Money.of('100', USD);
    expect(() => uzs.plus(usd)).toThrow(CurrencyMismatchError);
    expect(() => uzs.minus(usd)).toThrow(CurrencyMismatchError);
    expect(() => uzs.compare(usd)).toThrow(CurrencyMismatchError);
    expect(uzs.equals(usd)).toBe(false);
  });

  it('rejects non-finite and zero-divisor input', () => {
    expect(() => Money.of('Infinity', UZS)).toThrow(TypeError);
    expect(() => Money.of('0', UZS).dividedBy('0')).toThrow(RangeError);
  });

  it('sums an empty list into a typed zero', () => {
    expect(Money.sum([], UZS).toString()).toBe('0.0000 UZS');
    expect(Money.sum([Money.of('1', UZS), Money.of('2.5', UZS)], UZS).toStorage()).toBe('3.5000');
  });

  it('converts at a rate into the target currency', () => {
    const usd = Money.of('100.00', USD);
    const uzs = usd.convert('12650.1234567890', UZS);
    expect(uzs.currency).toBe(UZS);
    expect(uzs.toStorage()).toBe('1265012.3457');
  });

  it('exposes sign, comparison and JSON shape', () => {
    const positive = Money.of('1', UZS);
    const negative = positive.negated();
    expect(positive.isPositive()).toBe(true);
    expect(negative.isNegative()).toBe(true);
    expect(Money.zero(UZS).isZero()).toBe(true);
    expect(negative.abs().equals(positive)).toBe(true);
    expect(positive.compare(negative)).toBe(1);
    expect(negative.compare(positive)).toBe(-1);
    expect(positive.compare(positive)).toBe(0);
    expect(positive.toJSON()).toEqual({ value: '1.0000', currency: 'UZS' });
    expect(Money.of(new Decimal('7'), 'UZS').toStorage()).toBe('7.0000');
  });
});
