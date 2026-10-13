/**
 * Domain vocabularies, shared by the schema (which turns them into CHECK
 * constraints), the ledger and the region packs. They live here rather than in
 * `@fincore/db` because they describe the business, not its storage — a region
 * pack must not have to depend on the database package to name a flow type.
 *
 * Plain string unions, not Postgres enums: `ALTER TYPE ... ADD VALUE` cannot
 * run inside the transaction drizzle-kit wraps migrations in, and this
 * vocabulary grows every time a module lands.
 */
export const ACCOUNT_KINDS = ['bank', 'cash', 'card', 'ewallet', 'acquiring', 'virtual'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** I5: only these kinds may appear in a cash-flow figure. */
export const CASH_ACCOUNT_KINDS = ['bank', 'cash', 'card', 'ewallet', 'acquiring'] as const;
export type CashAccountKind = (typeof CASH_ACCOUNT_KINDS)[number];

export const GL_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type GlAccountType = (typeof GL_ACCOUNT_TYPES)[number];

export const SIDES = ['D', 'C'] as const;
export type Side = (typeof SIDES)[number];

export const FLOW_TYPES = [
  'revenue',
  'cogs',
  'opex_variable',
  'opex_fixed',
  'below_ebitda',
  'below_net_profit',
  'financing',
  'investing',
  'transfer',
] as const;
export type FlowType = (typeof FLOW_TYPES)[number];

export const ENTRY_KINDS = [
  'cash',
  'accrual',
  'payroll',
  'depreciation',
  'tax',
  'loan',
  'allocation',
  'fx_revaluation',
  'opening',
  'closing',
  'manual',
  'reversal',
] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const COUNTERPARTY_KINDS = [
  'customer',
  'supplier',
  'employee',
  'bank',
  'gov',
  'owner',
] as const;
export type CounterpartyKind = (typeof COUNTERPARTY_KINDS)[number];

export const MEMBERSHIP_ROLES = [
  'owner',
  'cfo',
  'accountant',
  'operator',
  'head_of_direction',
  'viewer',
  'auditor',
] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** SQL fragment for a CHECK against one of these vocabularies. */
export function inList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}

/**
 * What a report resolves a GL account by, independent of a country's account
 * numbering. A balance sheet groups by role; I5 finds cash accounts by role.
 */
export type GlAccountRole =
  // Assets
  | 'cash'
  | 'money_in_transit'
  | 'receivable'
  | 'prepaid'
  | 'inventory'
  | 'input_vat'
  | 'fixed_asset'
  | 'accumulated_depreciation'
  // Liabilities
  | 'payable'
  | 'advance_received'
  | 'payroll_payable'
  | 'loan'
  | 'accrued_interest'
  | 'output_vat'
  | 'tax_payable'
  // Equity
  | 'share_capital'
  | 'retained_earnings'
  | 'owner_draw'
  // Income
  | 'revenue'
  | 'other_income'
  // Expenses
  | 'cost_of_sales'
  | 'expense'
  | 'depreciation'
  | 'interest_expense'
  | 'tax_expense'
  | 'fx_difference';

export const GL_ACCOUNT_ROLES: readonly GlAccountRole[] = [
  'cash',
  'money_in_transit',
  'receivable',
  'prepaid',
  'inventory',
  'input_vat',
  'fixed_asset',
  'accumulated_depreciation',
  'payable',
  'advance_received',
  'payroll_payable',
  'loan',
  'accrued_interest',
  'output_vat',
  'tax_payable',
  'share_capital',
  'retained_earnings',
  'owner_draw',
  'revenue',
  'other_income',
  'cost_of_sales',
  'expense',
  'depreciation',
  'interest_expense',
  'tax_expense',
  'fx_difference',
];

/**
 * The account class each role must belong to. A balance sheet that groups by
 * role has to be able to trust that `loan` is a liability — otherwise a
 * mis-tagged account moves money across the balance sheet silently.
 */
export const ROLE_ACCOUNT_TYPE: Readonly<Record<GlAccountRole, GlAccountType>> = {
  cash: 'asset',
  money_in_transit: 'asset',
  receivable: 'asset',
  prepaid: 'asset',
  inventory: 'asset',
  input_vat: 'asset',
  fixed_asset: 'asset',
  accumulated_depreciation: 'asset',
  payable: 'liability',
  advance_received: 'liability',
  payroll_payable: 'liability',
  loan: 'liability',
  accrued_interest: 'liability',
  output_vat: 'liability',
  tax_payable: 'liability',
  share_capital: 'equity',
  retained_earnings: 'equity',
  owner_draw: 'equity',
  revenue: 'income',
  other_income: 'income',
  cost_of_sales: 'expense',
  expense: 'expense',
  depreciation: 'expense',
  interest_expense: 'expense',
  tax_expense: 'expense',
  fx_difference: 'expense',
};
