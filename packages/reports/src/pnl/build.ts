import {
  Decimal,
  Money,
  type CurrencyCode,
  type FlowType,
  type GlAccountRole,
  type IsoDate,
} from '@fincore/shared';
import {
  FIXED_FLOW_TYPES,
  PNL,
  VARIABLE_FLOW_TYPES,
  type PnlLineSpec,
  type PnlValueLine,
} from './structure.js';

/**
 * One grouped slice of the ledger's income and expense lines, already summed.
 * `amount` is stated in the line's natural direction: revenue positive as
 * income, expenses positive as cost, so the P&L subtracts rather than negates.
 */
export interface PnlFact {
  readonly role: GlAccountRole;
  /** Flow type of the line's article, or null when it has none. */
  readonly flowType: FlowType | null;
  readonly articleId: string | null;
  readonly articleName: string | null;
  readonly directionId: string | null;
  readonly directionName: string | null;
  readonly amount: Money;
}

export type PnlGrouping = 'none' | 'article' | 'direction' | 'direction_article';

export interface PnlBreakdownRow {
  readonly articleId: string | null;
  readonly articleName: string | null;
  readonly directionId: string | null;
  readonly directionName: string | null;
  readonly amount: Money;
  readonly priorAmount: Money | null;
}

export interface PnlRow {
  readonly code: string;
  readonly labelKey: string;
  readonly level: 0 | 1;
  readonly kind: PnlLineSpec['kind'];
  /** Present on `value` and `subtotal` rows. */
  readonly amount: Money | null;
  /** Percentage as an exact decimal string; null when the base is zero. */
  readonly percent: string | null;
  /** Same figure for the comparison period, when one was requested. */
  readonly priorAmount: Money | null;
  readonly priorPercent: string | null;
  /** amount − priorAmount. */
  readonly delta: Money | null;
  /** delta ÷ |priorAmount| as a percentage; null when prior is zero. */
  readonly deltaPercent: string | null;
  /** Empty unless a grouping was requested and this is a `value` row. */
  readonly breakdown: readonly PnlBreakdownRow[];
}

export interface PnlReport {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly comparison: { readonly from: IsoDate; readonly to: IsoDate } | null;
  readonly currency: CurrencyCode;
  readonly grouping: PnlGrouping;
  readonly rows: readonly PnlRow[];
}

/** Does a fact belong on a line? Roles first, then the flow-type filter. */
export function matches(spec: PnlValueLine, fact: PnlFact): boolean {
  if (!spec.roles.includes(fact.role)) {
    return false;
  }
  if (spec.flowTypes === null) {
    return true;
  }
  if (spec.flowTypes.includes(fact.flowType)) {
    return true;
  }
  // `[null]` is the catch-all bucket: anything this role's other lines do not
  // claim lands here rather than disappearing.
  if (!spec.flowTypes.includes(null)) {
    return false;
  }
  const claimedElsewhere: readonly FlowType[] = [...VARIABLE_FLOW_TYPES, ...FIXED_FLOW_TYPES];
  return fact.flowType === null || !claimedElsewhere.includes(fact.flowType);
}

function groupKey(grouping: PnlGrouping, fact: PnlFact): string | null {
  switch (grouping) {
    case 'none':
      return null;
    case 'article':
      return fact.articleId ?? '∅';
    case 'direction':
      return fact.directionId ?? '∅';
    case 'direction_article':
      return `${fact.directionId ?? '∅'}|${fact.articleId ?? '∅'}`;
  }
}

/** Percentage of `base`, as an exact decimal string with four decimals. */
function percentOf(part: Money, base: Money): string | null {
  if (base.isZero()) {
    return null;
  }
  return new Decimal(part.toStorage())
    .dividedBy(new Decimal(base.toStorage()))
    .times(100)
    .toFixed(4);
}

interface LineAmounts {
  readonly amount: Money;
  readonly breakdown: Map<string, PnlBreakdownRow>;
}

function sumLines(
  facts: readonly PnlFact[],
  structure: readonly PnlLineSpec[],
  grouping: PnlGrouping,
  currency: CurrencyCode,
): Map<string, LineAmounts> {
  const zero = Money.zero(currency);
  const result = new Map<string, LineAmounts>();

  for (const spec of structure) {
    if (spec.kind !== 'value') {
      continue;
    }
    let amount = zero;
    const breakdown = new Map<string, PnlBreakdownRow>();
    for (const fact of facts) {
      if (!matches(spec, fact)) {
        continue;
      }
      amount = amount.plus(fact.amount);
      const key = groupKey(grouping, fact);
      if (key === null) {
        continue;
      }
      const existing = breakdown.get(key);
      breakdown.set(key, {
        articleId: fact.articleId,
        articleName: fact.articleName,
        directionId: fact.directionId,
        directionName: fact.directionName,
        amount: (existing?.amount ?? zero).plus(fact.amount),
        priorAmount: null,
      });
    }
    result.set(spec.code, { amount, breakdown });
  }
  return result;
}

/**
 * Amount per line, resolved in dependency order rather than declaration order,
 * so the structure can be reordered without breaking the arithmetic. Value
 * lines are seeded from `lines`; subtotals recurse through their components.
 */
function resolveSubtotals(
  lines: Map<string, LineAmounts>,
  structure: readonly PnlLineSpec[],
  currency: CurrencyCode,
): Map<string, Money> {
  const specByCode = new Map(structure.map((spec) => [spec.code, spec]));
  const resolved = new Map<string, Money>();
  for (const [code, line] of lines) {
    resolved.set(code, line.amount);
  }
  const inProgress = new Set<string>();

  function amountOf(code: string): Money {
    const cached = resolved.get(code);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(code)) {
      throw new Error(`P&L structure has a cycle at: ${code}`);
    }
    const spec = specByCode.get(code);
    if (spec?.kind !== 'subtotal') {
      // Either the code does not exist, or it is a margin — a percentage is
      // not a summable amount, so a structure asking for one is broken.
      throw new Error(`P&L structure cannot sum line: ${code}`);
    }
    inProgress.add(code);

    let amount = Money.zero(currency);
    for (const component of spec.components) {
      const part = amountOf(component.code);
      amount = component.sign === 1 ? amount.plus(part) : amount.minus(part);
    }

    inProgress.delete(code);
    resolved.set(code, amount);
    return amount;
  }

  for (const spec of structure) {
    if (spec.kind === 'subtotal') {
      amountOf(spec.code);
    }
  }
  return resolved;
}

/**
 * Reads a resolved amount, or fails. There is no zero fallback on purpose: a
 * missing line means the structure is inconsistent, and a silent zero would
 * show up as a plausible figure on a financial report.
 */
function requireAmount(amounts: Map<string, Money>, code: string): Money {
  const amount = amounts.get(code);
  if (amount === undefined) {
    throw new Error(`P&L structure references a line with no amount: ${code}`);
  }
  return amount;
}

export interface BuildPnlOptions {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly currency: CurrencyCode;
  readonly grouping: PnlGrouping;
  readonly comparison: { readonly from: IsoDate; readonly to: IsoDate } | null;
}

/**
 * Builds the P&L from grouped facts. Pure: margins are derived on every read,
 * never stored, and no rounding adjustment line exists — if the figures do not
 * tie, the reconciliation test says so instead of the report hiding it.
 */
export function buildPnl(
  facts: readonly PnlFact[],
  options: BuildPnlOptions,
  priorFacts: readonly PnlFact[] = [],
  structure: readonly PnlLineSpec[] = PNL,
): PnlReport {
  const { currency, grouping, comparison } = options;
  const zero = Money.zero(currency);

  const lines = sumLines(facts, structure, grouping, currency);
  const amounts = resolveSubtotals(lines, structure, currency);

  const hasComparison = comparison !== null;
  const priorLines = hasComparison
    ? sumLines(priorFacts, structure, grouping, currency)
    : new Map<string, LineAmounts>();
  const priorAmounts = hasComparison
    ? resolveSubtotals(priorLines, structure, currency)
    : new Map<string, Money>();

  const rows: PnlRow[] = structure.map((spec) => {
    if (spec.kind === 'margin') {
      const percent = percentOf(
        requireAmount(amounts, spec.numerator),
        requireAmount(amounts, spec.denominator),
      );
      const priorPercent = hasComparison
        ? percentOf(
            requireAmount(priorAmounts, spec.numerator),
            requireAmount(priorAmounts, spec.denominator),
          )
        : null;
      return {
        code: spec.code,
        labelKey: spec.labelKey,
        level: spec.level,
        kind: spec.kind,
        amount: null,
        percent,
        priorAmount: null,
        priorPercent,
        delta: null,
        deltaPercent: null,
        breakdown: [],
      };
    }

    const amount = requireAmount(amounts, spec.code);
    const priorAmount = hasComparison ? requireAmount(priorAmounts, spec.code) : null;
    const delta = priorAmount === null ? null : amount.minus(priorAmount);
    const deltaPercent =
      delta === null || priorAmount === null ? null : percentOf(delta, priorAmount.abs());

    const priorBreakdown = priorLines.get(spec.code)?.breakdown;
    const breakdown = [...(lines.get(spec.code)?.breakdown.entries() ?? [])]
      .map(([key, row]) => ({
        ...row,
        priorAmount: hasComparison ? (priorBreakdown?.get(key)?.amount ?? zero) : null,
      }))
      .sort((a, b) => b.amount.compare(a.amount));

    return {
      code: spec.code,
      labelKey: spec.labelKey,
      level: spec.level,
      kind: spec.kind,
      amount,
      percent: null,
      priorAmount,
      priorPercent: null,
      delta,
      deltaPercent,
      breakdown,
    };
  });

  return {
    from: options.from,
    to: options.to,
    comparison,
    currency,
    grouping,
    rows,
  };
}
