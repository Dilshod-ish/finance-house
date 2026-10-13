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
