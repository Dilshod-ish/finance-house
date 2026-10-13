import type { GlAccountRole } from '@fincore/shared';

/**
 * The balance sheet's shape, declared as data in one place so the whole
 * structure is reviewable without reading aggregation code — and so moving a
 * line is a one-line change.
 *
 * Standard management structure (architecture §7.3): current and non-current
 * assets, current and non-current liabilities, then equity. Deliberately not
 * the statutory NSBU/BHMS balance sheet — this is the owner's view.
 */
export type BalanceSheetSide = 'assets' | 'liabilities_and_equity';

export type BalanceSheetLineKind =
  /** Sums the GL accounts carrying `roles`. */
  | 'roles'
  /** The period's result, derived from income and expense roles. */
  | 'period_result'
  /** Sums other lines by code. */
  | 'subtotal';

export interface BalanceSheetLineSpec {
  readonly code: string;
  readonly labelKey: string;
  readonly side: BalanceSheetSide;
  /** 0 = section heading, 1 = group, 2 = detail line. */
  readonly level: 0 | 1 | 2;
  readonly kind: BalanceSheetLineKind;
  /** For `roles` lines: which account roles feed it. */
  readonly roles: readonly GlAccountRole[];
  /** For `subtotal` lines: which line codes it adds up. */
  readonly components: readonly string[];
}

const line = (
  code: string,
  labelKey: string,
  side: BalanceSheetSide,
  level: 0 | 1 | 2,
  roles: readonly GlAccountRole[],
): BalanceSheetLineSpec => ({ code, labelKey, side, level, kind: 'roles', roles, components: [] });

const subtotal = (
  code: string,
  labelKey: string,
  side: BalanceSheetSide,
  level: 0 | 1 | 2,
  components: readonly string[],
): BalanceSheetLineSpec => ({
  code,
  labelKey,
  side,
  level,
  kind: 'subtotal',
  roles: [],
  components,
});

/**
 * Every role appears exactly once on an asset or liability/equity line, except
 * the income and expense roles, which feed `equity.result` instead of a line of
 * their own. `BALANCE_SHEET_ROLE_COVERAGE` is asserted in the tests: a role
 * that no line claims would make money disappear from the sheet silently.
 */
export const BALANCE_SHEET: readonly BalanceSheetLineSpec[] = [
  // ---- Assets ----------------------------------------------------------
  subtotal('assets', 'bs.assets', 'assets', 0, ['assets.current', 'assets.noncurrent']),

  subtotal('assets.current', 'bs.assets.current', 'assets', 1, [
    'assets.current.cash',
    'assets.current.receivable',
    'assets.current.prepaid',
    'assets.current.inventory',
    'assets.current.recoverableTax',
  ]),
  line('assets.current.cash', 'bs.assets.cash', 'assets', 2, ['cash', 'money_in_transit']),
  line('assets.current.receivable', 'bs.assets.receivable', 'assets', 2, ['receivable']),
  line('assets.current.prepaid', 'bs.assets.prepaid', 'assets', 2, ['prepaid']),
  line('assets.current.inventory', 'bs.assets.inventory', 'assets', 2, ['inventory']),
  line('assets.current.recoverableTax', 'bs.assets.recoverableTax', 'assets', 2, ['input_vat']),

  subtotal('assets.noncurrent', 'bs.assets.noncurrent', 'assets', 1, [
    'assets.noncurrent.fixedAssets',
  ]),
  // Net book value: accumulated depreciation is a credit-balance asset, so it
  // nets against cost on the same line.
  line('assets.noncurrent.fixedAssets', 'bs.assets.fixedAssets', 'assets', 2, [
    'fixed_asset',
    'accumulated_depreciation',
  ]),

  // ---- Liabilities and equity ------------------------------------------
  subtotal('liabilitiesAndEquity', 'bs.liabilitiesAndEquity', 'liabilities_and_equity', 0, [
    'liabilities',
    'equity',
  ]),

  subtotal('liabilities.current', 'bs.liabilities.current', 'liabilities_and_equity', 1, [
    'liabilities.current.payable',
    'liabilities.current.advances',
    'liabilities.current.payroll',
    'liabilities.current.taxes',
    'liabilities.current.interest',
  ]),
  line('liabilities.current.payable', 'bs.liabilities.payable', 'liabilities_and_equity', 2, [
    'payable',
  ]),
  line('liabilities.current.advances', 'bs.liabilities.advances', 'liabilities_and_equity', 2, [
    'advance_received',
  ]),
  line('liabilities.current.payroll', 'bs.liabilities.payroll', 'liabilities_and_equity', 2, [
    'payroll_payable',
  ]),
  line('liabilities.current.taxes', 'bs.liabilities.taxes', 'liabilities_and_equity', 2, [
    'tax_payable',
    'output_vat',
  ]),
  line('liabilities.current.interest', 'bs.liabilities.interest', 'liabilities_and_equity', 2, [
    'accrued_interest',
  ]),

  subtotal('liabilities.noncurrent', 'bs.liabilities.noncurrent', 'liabilities_and_equity', 1, [
    'liabilities.noncurrent.loans',
  ]),
  // Presented as non-current until the loan module carries maturity dates;
  // splitting it by maturity today would mean inventing the split.
  line('liabilities.noncurrent.loans', 'bs.liabilities.loans', 'liabilities_and_equity', 2, [
    'loan',
  ]),

  // Totals follow the groups they add up, so a total never reads as a heading.
  subtotal('liabilities', 'bs.liabilities', 'liabilities_and_equity', 1, [
    'liabilities.current',
    'liabilities.noncurrent',
  ]),

  subtotal('equity', 'bs.equity', 'liabilities_and_equity', 1, [
    'equity.shareCapital',
    'equity.retained',
    'equity.result',
    'equity.ownerDraw',
  ]),
  line('equity.shareCapital', 'bs.equity.shareCapital', 'liabilities_and_equity', 2, [
    'share_capital',
  ]),
  line('equity.retained', 'bs.equity.retained', 'liabilities_and_equity', 2, ['retained_earnings']),
  {
    code: 'equity.result',
    labelKey: 'bs.equity.result',
    side: 'liabilities_and_equity',
    level: 2,
    kind: 'period_result',
    roles: [],
    components: [],
  },
  // Dividends and owner withdrawals are a debit-balance equity account, so they
  // reduce equity on their own line.
  line('equity.ownerDraw', 'bs.equity.ownerDraw', 'liabilities_and_equity', 2, ['owner_draw']),
];

/** Roles that feed `equity.result` rather than a line of their own. */
export const RESULT_INCOME_ROLES: readonly GlAccountRole[] = ['revenue', 'other_income'];

export const RESULT_EXPENSE_ROLES: readonly GlAccountRole[] = [
  'cost_of_sales',
  'expense',
  'depreciation',
  'interest_expense',
  'tax_expense',
  'fx_difference',
];

export const TOTAL_ASSETS_CODE = 'assets';
export const TOTAL_LIABILITIES_AND_EQUITY_CODE = 'liabilitiesAndEquity';
export const TOTAL_LIABILITIES_CODE = 'liabilities';
export const TOTAL_EQUITY_CODE = 'equity';
