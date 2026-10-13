import DecimalDefault from 'decimal.js';
import type { Decimal as DecimalClass } from 'decimal.js';

/**
 * decimal.js ships CommonJS type declarations alongside an ESM build, so under
 * `module: nodenext` the default import is *typed* as the module namespace even
 * though the runtime value is the constructor. Retyped exactly once, here.
 */
const DecimalCtor = DecimalDefault as unknown as typeof DecimalClass;

/**
 * One configured Decimal constructor for the whole system. 34 significant
 * digits comfortably covers numeric(20,4) money multiplied by numeric(20,10)
 * FX rates without intermediate rounding (CLAUDE.md §5: round at presentation
 * only).
 */
export const Decimal = DecimalCtor.clone({
  precision: 34,
  rounding: DecimalCtor.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});

export type Decimal = DecimalClass;

/**
 * What may become a Decimal. Deliberately excludes `number`: a float literal is
 * how imprecision enters a ledger (invariant I7). Write `'0.1'`, not `0.1`.
 */
export type DecimalValue = string | DecimalClass;

/** Storage scale of every money column: numeric(20,4). */
export const MONEY_SCALE = 4;
/** Storage scale of fx_rate: numeric(20,10). */
export const FX_RATE_SCALE = 10;

export function decimal(value: DecimalValue): Decimal {
  return new Decimal(value);
}
