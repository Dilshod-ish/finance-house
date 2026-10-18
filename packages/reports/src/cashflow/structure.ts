import type { GlAccountRole } from '@fincore/shared';
import { rolesForLine } from '../structure-roles.js';

/**
 * The cash flow statement (ДДС), declared as data — architecture §7.1.
 *
 * Two rules decide everything here.
 *
 * **I5** — only lines touching an account of kind `bank | cash | card |
 * ewallet | acquiring` are cash. **I6** — a cash movement is dated by
 * `cash_date`, never `accrual_date`. Together they are the whole difference
 * between this report and the P&L: the same revenue appears in both, in
 * different months, and neither is wrong.
 */

export type CashFlowSection =
  | 'operating'
  | 'investing'
  | 'financing'
  | 'transfer'
  /**
   * The money moved, but nobody has said what for yet. Its own section rather
   * than a share of operating: classifying it by guess would make the three
   * real sections wrong, and showing its size is what tells the owner how much
   * of the statement is still unexplained.
   */
  | 'unassigned';

/**
 * What a cash movement was *for* is the account on the other side of the
 * entry. That is the classification, and it needs no dimension to be filled
 * in: every line has a GL account, and every GL account has a role, so every
 * cash movement lands in a section. Articles refine it (§7.1 cross-sections)
 * but are never what makes the statement complete.
 *
 * One treatment is a genuine choice rather than a fact, and it is marked
 * below: interest paid. See ADR-0008.
 */
export const SECTION_BY_CONTRA_ROLE: Readonly<Record<GlAccountRole, CashFlowSection>> = {
  // Money moving between the organization's own accounts, or in transit
  // between them, is not a flow of the business.
  cash: 'transfer',
  money_in_transit: 'transfer',

  // Investing: the long-term asset base.
  fixed_asset: 'investing',
  accumulated_depreciation: 'investing',

  // Financing: the capital structure and its servicing.
  loan: 'financing',
  share_capital: 'financing',
  owner_draw: 'financing',
  retained_earnings: 'financing',

  // Cash that has arrived and is not classified yet (see `suspense`).
  suspense: 'unassigned',

  // Operating: everything the business does to earn.
  receivable: 'operating',
  prepaid: 'operating',
  inventory: 'operating',
  input_vat: 'operating',
  payable: 'operating',
  advance_received: 'operating',
  payroll_payable: 'operating',
  output_vat: 'operating',
  tax_payable: 'operating',
  revenue: 'operating',
  other_income: 'operating',
  cost_of_sales: 'operating',
  expense: 'operating',
  depreciation: 'operating',
  tax_expense: 'operating',
  fx_difference: 'operating',
  // Interest paid is operating here, not financing: the owner reads operating
  // cash as "what the business produced after the cost of running it", and
  // debt service is a running cost. IAS 7 permits either. One line to change.
  interest_expense: 'operating',
  accrued_interest: 'operating',
};

export type CashFlowLineKind =
  /** Gross inflows or outflows of one section. */
  | 'flow'
  /** Sums other lines by code. */
  | 'subtotal'
  /** The cash balance at a point in time, not a movement. */
  | 'balance'
  /** Movement on a cash account that was not a cash movement — see below. */
  | 'non_cash';

export type FlowDirection = 'in' | 'out';

interface CashFlowLineBase {
  readonly code: string;
  readonly labelKey: string;
  /** 0 = section heading, 1 = detail. */
  readonly level: 0 | 1;
}

/** Gross inflows or outflows of one section. */
export interface CashFlowFlowLine extends CashFlowLineBase {
  readonly kind: 'flow';
  readonly section: CashFlowSection;
  readonly direction: FlowDirection;
}

export interface CashFlowSubtotalLine extends CashFlowLineBase {
  readonly kind: 'subtotal';
  readonly components: readonly { readonly code: string; readonly sign: 1 | -1 }[];
}

/** A position or a non-movement: it has no section and sums nothing. */
export interface CashFlowMarkerLine extends CashFlowLineBase {
  readonly kind: 'balance' | 'non_cash';
}

/**
 * A union rather than one shape with nullable fields: a `flow` line always has
 * a section, and a type that says so leaves no unreachable branch to pretend
 * to test (CLAUDE.md §6 — 100% coverage, no exceptions).
 */
export type CashFlowLineSpec = CashFlowFlowLine | CashFlowSubtotalLine | CashFlowMarkerLine;

const flow = (
  code: string,
  labelKey: string,
  section: CashFlowSection,
  direction: FlowDirection,
): CashFlowFlowLine => ({ code, labelKey, level: 1, kind: 'flow', section, direction });

const subtotal = (
  code: string,
  labelKey: string,
  level: 0 | 1,
  components: readonly { readonly code: string; readonly sign: 1 | -1 }[],
): CashFlowSubtotalLine => ({ code, labelKey, level, kind: 'subtotal', components });

const plus = (code: string): { code: string; sign: 1 } => ({ code, sign: 1 });
const minus = (code: string): { code: string; sign: -1 } => ({ code, sign: -1 });

const marker = (
  code: string,
  labelKey: string,
  kind: 'balance' | 'non_cash',
  level: 0 | 1 = 0,
): CashFlowMarkerLine => ({ code, labelKey, level, kind });

export const OPENING_CASH_CODE = 'openingCash';
export const CLOSING_CASH_CODE = 'closingCash';
export const NON_CASH_CODE = 'nonCashChange';
export const NET_FLOW_CODE = 'netFlow';
export const TRANSFER_CODE = 'transfer';

/**
 * Inflows and outflows are shown gross, never netted into one figure per
 * section: "we took in 1,7 bln and paid out 1,5 bln" and "we netted 0,2 bln"
 * are different facts, and the owner needs the first.
 */
export const CASH_FLOW: readonly CashFlowLineSpec[] = [
  marker(OPENING_CASH_CODE, 'cf.openingCash', 'balance'),

  subtotal('operating', 'cf.operating', 0, [plus('operating.in'), minus('operating.out')]),
  flow('operating.in', 'cf.operating.in', 'operating', 'in'),
  flow('operating.out', 'cf.operating.out', 'operating', 'out'),

  subtotal('investing', 'cf.investing', 0, [plus('investing.in'), minus('investing.out')]),
  flow('investing.in', 'cf.investing.in', 'investing', 'in'),
  flow('investing.out', 'cf.investing.out', 'investing', 'out'),

  subtotal('financing', 'cf.financing', 0, [plus('financing.in'), minus('financing.out')]),
  flow('financing.in', 'cf.financing.in', 'financing', 'in'),
  flow('financing.out', 'cf.financing.out', 'financing', 'out'),

  /*
   * Placed last of the four so the statement reads "…and this much we have not
   * explained yet", and inside the net flow because the money did move: the
   * bank balance does not wait for the inbox to be emptied.
   */
  subtotal('unassigned', 'cf.unassigned', 0, [plus('unassigned.in'), minus('unassigned.out')]),
  flow('unassigned.in', 'cf.unassigned.in', 'unassigned', 'in'),
  flow('unassigned.out', 'cf.unassigned.out', 'unassigned', 'out'),

  subtotal(NET_FLOW_CODE, 'cf.netFlow', 0, [
    plus('operating'),
    plus('investing'),
    plus('financing'),
    plus('unassigned'),
  ]),

  /*
   * Transfers between the organization's own accounts. Shown because a single
   * account's statement must still tie, and excluded from the net flow because
   * at organization level they are the same money twice. They sum to zero over
   * every account, which the integration tests assert.
   */
  subtotal('transfer', 'cf.transfer', 0, [plus('transfer.in'), minus('transfer.out')]),
  flow('transfer.in', 'cf.transfer.in', 'transfer', 'in'),
  flow('transfer.out', 'cf.transfer.out', 'transfer', 'out'),

  /*
   * Movement on a cash account that was not a cash movement: an FX
   * revaluation, or an opening balance posted into the period. Without this
   * line, opening + net flow would not reach closing and the difference would
   * have to be plugged — which CLAUDE.md §1 forbids outright. It is computed
   * directly from the ledger, never as the gap between two other figures.
   */
  marker(NON_CASH_CODE, 'cf.nonCashChange', 'non_cash'),

  marker(CLOSING_CASH_CODE, 'cf.closingCash', 'balance'),
];

/** Roles whose contra makes a movement belong to this section. */
export function rolesForSection(section: CashFlowSection): readonly GlAccountRole[] {
  return Object.entries(SECTION_BY_CONTRA_ROLE)
    .filter(([, value]) => value === section)
    .map(([role]) => role as GlAccountRole);
}

/**
 * Drill-down for a cash-flow line resolves to the *contra* roles, because that
 * is what the section means. A balance line resolves to the cash roles
 * themselves — the reader is asking what the balance is made of.
 */
export function contraRolesForCashFlowLine(code: string): readonly GlAccountRole[] {
  return rolesForLine(
    code,
    CASH_FLOW,
    (spec) => {
      switch (spec.kind) {
        case 'flow':
          return { roles: rolesForSection(spec.section), components: [] };
        case 'subtotal':
          return { roles: [], components: spec.components.map((part) => part.code) };
        case 'balance':
        case 'non_cash':
          return { roles: [], components: [] };
      }
    },
    (at) => `Not a cash-flow line: ${at}`,
  );
}
