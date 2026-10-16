import {
  Money,
  addMonths,
  monthKey,
  monthsBetween,
  startOfMonth,
  type CurrencyCode,
  type IsoDate,
  type MonthKey,
} from '@fincore/shared';
import {
  CASH_FLOW,
  CLOSING_CASH_CODE,
  NET_FLOW_CODE,
  NON_CASH_CODE,
  OPENING_CASH_CODE,
  TRANSFER_CODE,
  type CashFlowLineSpec,
  type CashFlowSection,
  type FlowDirection,
} from './structure.js';

/**
 * One grouped slice of cash movement, already summed. `amount` is the positive
 * magnitude; which way the money went is `direction`, so inflows and outflows
 * stay gross rather than netting inside a row.
 */
export interface CashFlowFact {
  readonly period: MonthKey;
  readonly section: CashFlowSection;
  readonly direction: FlowDirection;
  readonly articleId: string | null;
  readonly articleName: string | null;
  readonly directionId: string | null;
  readonly directionName: string | null;
  readonly counterpartyId: string | null;
  readonly counterpartyName: string | null;
  /** Never null: a cash movement is a line on a cash account (I5). */
  readonly accountId: string;
  readonly accountName: string;
  readonly amount: Money;
}

export type CashFlowGrouping = 'none' | 'article' | 'direction' | 'counterparty' | 'account';

/** Opening and closing position, and the movement that was not a flow. */
export interface CashPosition {
  readonly openingCash: Money;
  readonly closingCash: Money;
  /** Per period: movement on cash accounts with no `cash_date` (I6). */
  readonly nonCashByPeriod: ReadonlyMap<MonthKey, Money>;
}

export interface CashFlowBreakdownRow {
  readonly key: string;
  readonly label: string | null;
  readonly articleId: string | null;
  readonly directionId: string | null;
  readonly counterpartyId: string | null;
  readonly accountId: string;
  /** Same order as the report's periods. */
  readonly amounts: readonly Money[];
  readonly total: Money;
}

export interface CashFlowRow {
  readonly code: string;
  readonly labelKey: string;
  readonly level: 0 | 1;
  readonly kind: CashFlowLineSpec['kind'];
  /** One figure per period column, in `periods` order. */
  readonly amounts: readonly Money[];
  readonly total: Money;
  readonly breakdown: readonly CashFlowBreakdownRow[];
}

export interface CashFlowReport {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly currency: CurrencyCode;
  readonly grouping: CashFlowGrouping;
  /** The column headings: every month the range touches, in order. */
  readonly periods: readonly MonthKey[];
  readonly rows: readonly CashFlowRow[];
}

/** Every month the range touches, whether or not anything happened in it. */
export function periodsBetween(from: IsoDate, to: IsoDate): MonthKey[] {
  const count = monthsBetween(from, to);
  const first = startOfMonth(from);
  return Array.from({ length: count + 1 }, (_, index) => monthKey(addMonths(first, index)));
}

/**
 * Which bucket a fact falls into, and what to call it — resolved together, so
 * a key can never end up without its label. `null` means no grouping was
 * asked for. An untagged movement gets its own bucket rather than vanishing.
 */
function groupOf(
  grouping: CashFlowGrouping,
  fact: CashFlowFact,
): { readonly key: string; readonly label: string | null } | null {
  switch (grouping) {
    case 'none':
      return null;
    case 'article':
      return { key: fact.articleId ?? '∅', label: fact.articleName };
    case 'direction':
      return { key: fact.directionId ?? '∅', label: fact.directionName };
    case 'counterparty':
      return { key: fact.counterpartyId ?? '∅', label: fact.counterpartyName };
    case 'account':
      return { key: fact.accountId, label: fact.accountName };
  }
}

/**
 * A figure per period, keyed rather than positional. Indexing a fixed-length
 * array would leave `?? zero` guards that can never fire and so can never be
 * tested; a missing month genuinely means zero, and that read is one place.
 */
type Series = Map<MonthKey, Money>;

interface LineTally {
  readonly series: Series;
  readonly breakdown: Map<string, { label: string | null; fact: CashFlowFact; series: Series }>;
}

export interface BuildCashFlowOptions {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly currency: CurrencyCode;
  readonly grouping: CashFlowGrouping;
  readonly position: CashPosition;
}

/**
 * Builds the statement from grouped facts. Pure, and with no plug anywhere:
 * closing cash is opening plus everything that moved, and if that does not
 * equal the ledger's cash balance the reconciliation says so rather than the
 * report hiding it.
 */
export function buildCashFlow(
  facts: readonly CashFlowFact[],
  options: BuildCashFlowOptions,
  structure: readonly CashFlowLineSpec[] = CASH_FLOW,
): CashFlowReport {
  const { currency, grouping, position } = options;
  const zero = Money.zero(currency);
  const periods = periodsBetween(options.from, options.to);
  const known = new Set<string>(periods);

  /** A month with no movement is zero, not missing. */
  const at = (series: Series, period: MonthKey): Money => series.get(period) ?? zero;
  const add = (series: Series, period: MonthKey, amount: Money): void => {
    series.set(period, at(series, period).plus(amount));
  };
  const spread = (series: Series): Money[] => periods.map((period) => at(series, period));
  const sum = (series: Series): Money =>
    periods.reduce((running, period) => running.plus(at(series, period)), zero);

  // ---- Flow lines, from the facts ----------------------------------------
  const tallies = new Map<string, LineTally>();
  for (const spec of structure) {
    if (spec.kind !== 'flow') {
      continue;
    }
    const tally: LineTally = { series: new Map(), breakdown: new Map() };
    tallies.set(spec.code, tally);

    for (const fact of facts) {
      if (fact.section !== spec.section || fact.direction !== spec.direction) {
        continue;
      }
      if (!known.has(fact.period)) {
        // A fact outside the requested range is a query bug, not a row to drop.
        throw new Error(`cash-flow fact is outside the report period: ${fact.period}`);
      }
      add(tally.series, fact.period, fact.amount);

      const group = groupOf(grouping, fact);
      if (group === null) {
        continue;
      }
      const existing = tally.breakdown.get(group.key) ?? {
        label: group.label,
        fact,
        series: new Map<MonthKey, Money>(),
      };
      add(existing.series, fact.period, fact.amount);
      tally.breakdown.set(group.key, existing);
    }
  }

  // ---- Subtotals, resolved in dependency order ---------------------------
  const specByCode = new Map(structure.map((spec) => [spec.code, spec]));
  const resolved = new Map<string, Series>();
  for (const [code, tally] of tallies) {
    resolved.set(code, tally.series);
  }
  const inProgress = new Set<string>();

  function seriesOf(code: string): Series {
    const cached = resolved.get(code);
    if (cached !== undefined) {
      return cached;
    }
    if (inProgress.has(code)) {
      throw new Error(`cash-flow structure has a cycle at: ${code}`);
    }
    const spec = specByCode.get(code);
    if (spec?.kind !== 'subtotal') {
      throw new Error(`cash-flow structure cannot sum line: ${code}`);
    }
    inProgress.add(code);

    const series: Series = new Map();
    for (const component of spec.components) {
      const part = seriesOf(component.code);
      for (const period of periods) {
        const value = at(part, period);
        series.set(
          period,
          component.sign === 1 ? at(series, period).plus(value) : at(series, period).minus(value),
        );
      }
    }

    inProgress.delete(code);
    resolved.set(code, series);
    return series;
  }

  for (const spec of structure) {
    if (spec.kind === 'subtotal') {
      seriesOf(spec.code);
    }
  }

  // ---- Balances and the non-cash line ------------------------------------
  const nonCash: Series = new Map(position.nonCashByPeriod);
  resolved.set(NON_CASH_CODE, nonCash);

  /*
   * Opening is the ledger's cash balance the day before the range; each later
   * month opens where the previous one closed. Closing is opening plus
   * everything that moved — computed, never plugged.
   *
   * Transfers are in this walk although they are out of the net flow, and the
   * difference is not a contradiction. Over the organization they net to zero,
   * so they change nothing. Over one account they are the whole point: money
   * that left the bank for the cash desk really did leave the bank, and a
   * statement for that account must end where its balance ends.
   */
  const netFlow = seriesOf(NET_FLOW_CODE);
  const transfers = seriesOf(TRANSFER_CODE);
  const openingSeries: Series = new Map();
  const closingSeries: Series = new Map();
  const openingTotal = position.openingCash;
  let running = openingTotal;
  for (const period of periods) {
    openingSeries.set(period, running);
    running = running
      .plus(at(netFlow, period))
      .plus(at(transfers, period))
      .plus(at(nonCash, period));
    closingSeries.set(period, running);
  }
  const closingTotal = running;
  resolved.set(OPENING_CASH_CODE, openingSeries);
  resolved.set(CLOSING_CASH_CODE, closingSeries);

  // ---- Rows ---------------------------------------------------------------
  const rows: CashFlowRow[] = structure.map((spec) => {
    const series = resolved.get(spec.code);
    if (series === undefined) {
      throw new Error(`cash-flow structure references a line with no amounts: ${spec.code}`);
    }

    /*
     * A balance is a position, not a movement, so its "total" is where the
     * range ends — opening before the first month, closing after the last.
     * Adding a balance up across months would be meaningless.
     */
    const total =
      spec.kind === 'balance'
        ? spec.code === OPENING_CASH_CODE
          ? openingTotal
          : closingTotal
        : sum(series);

    const breakdown = [...(tallies.get(spec.code)?.breakdown.entries() ?? [])]
      .map(([key, entry]) => ({
        key,
        label: entry.label,
        articleId: entry.fact.articleId,
        directionId: entry.fact.directionId,
        counterpartyId: entry.fact.counterpartyId,
        accountId: entry.fact.accountId,
        amounts: spread(entry.series),
        total: sum(entry.series),
      }))
      .sort((a, b) => b.total.compare(a.total));

    return {
      code: spec.code,
      labelKey: spec.labelKey,
      level: spec.level,
      kind: spec.kind,
      amounts: spread(series),
      total,
      breakdown,
    };
  });

  return { from: options.from, to: options.to, currency, grouping, periods, rows };
}
