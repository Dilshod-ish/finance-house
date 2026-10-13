import { Money, type CurrencyCode, type GlAccountRole, type IsoDate } from '@fincore/shared';
import {
  BALANCE_SHEET,
  RESULT_EXPENSE_ROLES,
  RESULT_INCOME_ROLES,
  TOTAL_ASSETS_CODE,
  TOTAL_EQUITY_CODE,
  TOTAL_LIABILITIES_AND_EQUITY_CODE,
  TOTAL_LIABILITIES_CODE,
  type BalanceSheetLineSpec,
} from './structure.js';

/**
 * Balance per role, each stated in its own natural direction: debit-normal for
 * assets and expenses, credit-normal for liabilities, equity and income. The
 * query layer produces this; everything below is pure.
 */
export type RoleBalances = ReadonlyMap<GlAccountRole, Money>;

export interface BalanceSheetLine {
  readonly code: string;
  readonly labelKey: string;
  readonly side: BalanceSheetLineSpec['side'];
  readonly level: 0 | 1 | 2;
  readonly amount: Money;
  readonly isTotal: boolean;
}

export interface BalanceSheetReport {
  readonly asOf: IsoDate;
  readonly currency: CurrencyCode;
  readonly lines: readonly BalanceSheetLine[];
  readonly totalAssets: Money;
  readonly totalLiabilities: Money;
  readonly totalEquity: Money;
  /** Total assets − (liabilities + equity). Zero, or the ledger is broken. */
  readonly difference: Money;
  readonly isBalanced: boolean;
}

function sumRoles(
  balances: RoleBalances,
  roles: readonly GlAccountRole[],
  currency: CurrencyCode,
): Money {
  let total = Money.zero(currency);
  for (const role of roles) {
    const balance = balances.get(role);
    if (balance !== undefined) {
      total = total.plus(balance);
    }
  }
  return total;
}

/**
 * Builds the report from role balances. Pure: no database, no clock, and no
 * rounding — amounts arrive at storage scale and leave unchanged (CLAUDE.md §5
 * rounds at presentation only).
 *
 * `structure` is injectable so the malformed-structure paths below are
 * testable; production always passes the declared BALANCE_SHEET.
 */
export function buildBalanceSheet(
  balances: RoleBalances,
  options: { asOf: IsoDate; currency: CurrencyCode },
  structure: readonly BalanceSheetLineSpec[] = BALANCE_SHEET,
): BalanceSheetReport {
  const { asOf, currency } = options;
  const zero = Money.zero(currency);
  const specByCode = new Map(structure.map((spec) => [spec.code, spec]));

  // The period result is equity that has not been closed to retained earnings.
  const periodResult = sumRoles(balances, RESULT_INCOME_ROLES, currency).minus(
    sumRoles(balances, RESULT_EXPENSE_ROLES, currency),
  );

  const resolved = new Map<string, Money>();
  const inProgress = new Set<string>();

  /** Memoised so each line is computed once, in any declaration order. */
  function amountOf(code: string): Money {
    const cached = resolved.get(code);
    if (cached !== undefined) {
      return cached;
    }
    const spec = specByCode.get(code);
    if (spec === undefined) {
      throw new Error(`balance sheet structure references an unknown line: ${code}`);
    }
    if (inProgress.has(code)) {
      throw new Error(`balance sheet structure has a cycle at: ${code}`);
    }
    inProgress.add(code);

    let amount: Money;
    switch (spec.kind) {
      case 'roles':
        amount = sumRoles(balances, spec.roles, currency);
        break;
      case 'period_result':
        amount = periodResult;
        break;
      case 'subtotal': {
        let total = zero;
        for (const component of spec.components) {
          total = total.plus(amountOf(component));
        }
        amount = total;
        break;
      }
    }

    inProgress.delete(code);
    resolved.set(code, amount);
    return amount;
  }

  const lines = structure.map((spec) => ({
    code: spec.code,
    labelKey: spec.labelKey,
    side: spec.side,
    level: spec.level,
    amount: amountOf(spec.code),
    isTotal: spec.kind === 'subtotal',
  }));

  const totalAssets = amountOf(TOTAL_ASSETS_CODE);
  const difference = totalAssets.minus(amountOf(TOTAL_LIABILITIES_AND_EQUITY_CODE));

  return {
    asOf,
    currency,
    lines,
    totalAssets,
    totalLiabilities: amountOf(TOTAL_LIABILITIES_CODE),
    totalEquity: amountOf(TOTAL_EQUITY_CODE),
    difference,
    isBalanced: difference.isZero(),
  };
}
