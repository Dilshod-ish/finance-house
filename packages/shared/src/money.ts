import { Decimal, MONEY_SCALE, type DecimalValue } from './decimal.js';
import { currency as toCurrency, type CurrencyCode } from './currency.js';

export class CurrencyMismatchError extends Error {
  constructor(
    readonly left: CurrencyCode,
    readonly right: CurrencyCode,
  ) {
    super(`Currency mismatch: ${left} vs ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

/**
 * A monetary value: an exact decimal plus the currency it is denominated in.
 * Invariant I7 — money is never a `number`. Arithmetic keeps full precision;
 * `toStorage()` is the single place rounding to numeric(20,4) happens.
 */
export class Money {
  private constructor(
    readonly value: Decimal,
    readonly currency: CurrencyCode,
  ) {}

  static of(value: DecimalValue, currency: CurrencyCode | string): Money {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) {
      throw new TypeError(`Non-finite monetary value: ${String(value)}`);
    }
    return new Money(parsed, typeof currency === 'string' ? toCurrency(currency) : currency);
  }

  static zero(currency: CurrencyCode | string): Money {
    return Money.of('0', currency);
  }

  /** Sums a list; `currency` is required so an empty list still has one. */
  static sum(items: readonly Money[], currency: CurrencyCode | string): Money {
    return items.reduce((acc, item) => acc.plus(item), Money.zero(currency));
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  /** Scaling by a dimensionless factor (an FX rate, an allocation weight). */
  times(factor: DecimalValue): Money {
    return new Money(this.value.times(new Decimal(factor)), this.currency);
  }

  dividedBy(divisor: DecimalValue): Money {
    const d = new Decimal(divisor);
    if (d.isZero()) {
      throw new RangeError('Division of money by zero');
    }
    return new Money(this.value.dividedBy(d), this.currency);
  }

  negated(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.value.abs(), this.currency);
  }

  /** Converts into `target` at `rate` (units of target per unit of this). */
  convert(rate: DecimalValue, target: CurrencyCode | string): Money {
    return Money.of(this.value.times(new Decimal(rate)), target);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  isNegative(): boolean {
    return this.value.lessThan(0);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.equals(other.value);
  }

  /** Rounded to the storage scale; the only rounding on the write path. */
  round(): Money {
    return new Money(this.value.toDecimalPlaces(MONEY_SCALE), this.currency);
  }

  /** Exactly what goes into a numeric(20,4) column. */
  toStorage(): string {
    return this.value.toFixed(MONEY_SCALE);
  }

  toString(): string {
    return `${this.toStorage()} ${this.currency}`;
  }

  toJSON(): { value: string; currency: string } {
    return { value: this.toStorage(), currency: this.currency };
  }
}
