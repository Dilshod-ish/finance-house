import type { FlowType, GlAccountRole } from '@fincore/shared';

/**
 * The P&L, declared as data (architecture §7.2). Fixed structure: revenue,
 * COGS, gross profit, variable costs, marginal profit, fixed costs, EBITDA,
 * depreciation, interest, taxes, FX difference, net profit, dividends,
 * retained.
 *
 * Lines are selected by `gl_account.role`, not by article. `journal_line`
 * carries `article_id` only when something classified it — an FX revaluation
 * has no article at all — whereas every account has a role (ADR-0005). An
 * article-driven P&L would drop those lines silently.
 *
 * `article.flow_type` does one job here: splitting the `expense` role into
 * variable and fixed. That distinction is a property of the article, not of
 * the account.
 */
export type PnlLineKind = 'value' | 'subtotal' | 'margin';

export interface PnlComponent {
  readonly code: string;
  readonly sign: 1 | -1;
}

interface PnlLineBase {
  readonly code: string;
  readonly labelKey: string;
  /** 0 = headline figure, 1 = contributing line. */
  readonly level: 0 | 1;
}

/** Sums the given roles, optionally filtered by the article's flow type. */
export interface PnlValueLine extends PnlLineBase {
  readonly kind: 'value';
  readonly roles: readonly GlAccountRole[];
  /**
   * When set, only lines whose article has one of these flow types count.
   * `null` in the list marks the catch-all bucket: anything this role's other
   * lines do not claim lands there rather than disappearing.
   */
  readonly flowTypes: readonly (FlowType | null)[] | null;
}

/** Adds other lines with a sign. */
export interface PnlSubtotalLine extends PnlLineBase {
  readonly kind: 'subtotal';
  readonly components: readonly PnlComponent[];
}

/** A ratio of two other lines, rendered as a percentage. */
export interface PnlMarginLine extends PnlLineBase {
  readonly kind: 'margin';
  readonly numerator: string;
  readonly denominator: string;
}

/**
 * A discriminated union on purpose: a margin line carries its ratio by
 * construction, so no code has to guard against a margin without one.
 */
export type PnlLineSpec = PnlValueLine | PnlSubtotalLine | PnlMarginLine;

const value = (
  code: string,
  labelKey: string,
  level: 0 | 1,
  roles: readonly GlAccountRole[],
  flowTypes: readonly (FlowType | null)[] | null = null,
): PnlValueLine => ({ code, labelKey, level, kind: 'value', roles, flowTypes });

const subtotal = (
  code: string,
  labelKey: string,
  components: readonly PnlComponent[],
): PnlSubtotalLine => ({ code, labelKey, level: 0, kind: 'subtotal', components });

const margin = (
  code: string,
  labelKey: string,
  numerator: string,
  denominator: string,
): PnlMarginLine => ({ code, labelKey, level: 1, kind: 'margin', numerator, denominator });

const plus = (code: string): PnlComponent => ({ code, sign: 1 });
const minus = (code: string): PnlComponent => ({ code, sign: -1 });

/** Expense-role flow types that get a line of their own. */
export const VARIABLE_FLOW_TYPES: readonly FlowType[] = ['opex_variable'];
export const FIXED_FLOW_TYPES: readonly FlowType[] = ['opex_fixed'];

export const PNL: readonly PnlLineSpec[] = [
  value('revenue', 'pnl.revenue', 0, ['revenue']),
  value('cogs', 'pnl.cogs', 1, ['cost_of_sales']),
  subtotal('grossProfit', 'pnl.grossProfit', [plus('revenue'), minus('cogs')]),
  margin('grossMargin', 'pnl.grossMargin', 'grossProfit', 'revenue'),

  value('opexVariable', 'pnl.opexVariable', 1, ['expense'], VARIABLE_FLOW_TYPES),
  subtotal('marginalProfit', 'pnl.marginalProfit', [plus('grossProfit'), minus('opexVariable')]),
  margin('marginalMargin', 'pnl.marginalMargin', 'marginalProfit', 'revenue'),

  value('opexFixed', 'pnl.opexFixed', 1, ['expense'], FIXED_FLOW_TYPES),
  // Everything on an expense account that is neither variable nor fixed. Zero
  // on a well-kept ledger, and visible rather than quietly folded into fixed
  // costs when it is not.
  value('opexUnclassified', 'pnl.opexUnclassified', 1, ['expense'], [null]),
  subtotal('ebitda', 'pnl.ebitda', [
    plus('marginalProfit'),
    minus('opexFixed'),
    minus('opexUnclassified'),
  ]),
  margin('ebitdaMargin', 'pnl.ebitdaMargin', 'ebitda', 'revenue'),

  value('depreciation', 'pnl.depreciation', 1, ['depreciation']),
  value('interest', 'pnl.interest', 1, ['interest_expense']),
  value('tax', 'pnl.tax', 1, ['tax_expense']),
  value('fxDifference', 'pnl.fxDifference', 1, ['fx_difference']),
  value('otherIncome', 'pnl.otherIncome', 1, ['other_income']),
  subtotal('netProfit', 'pnl.netProfit', [
    plus('ebitda'),
    minus('depreciation'),
    minus('interest'),
    minus('tax'),
    minus('fxDifference'),
    plus('otherIncome'),
  ]),
  margin('netMargin', 'pnl.netMargin', 'netProfit', 'revenue'),

  value('dividends', 'pnl.dividends', 1, ['owner_draw']),
  subtotal('retained', 'pnl.retained', [plus('netProfit'), minus('dividends')]),
];

export const NET_PROFIT_CODE = 'netProfit';
export const REVENUE_CODE = 'revenue';
export const DIVIDENDS_CODE = 'dividends';

/**
 * Roles the P&L accounts for. Everything else belongs to the balance sheet
 * only; the tests assert this set is exactly the income and expense roles plus
 * `owner_draw`, which sits below net profit (§7.2).
 */
export const PNL_ROLES: readonly GlAccountRole[] = [
  'revenue',
  'cost_of_sales',
  'expense',
  'depreciation',
  'interest_expense',
  'tax_expense',
  'fx_difference',
  'other_income',
  'owner_draw',
];
