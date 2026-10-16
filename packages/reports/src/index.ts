import type { Database } from '@fincore/db';
import {
  Money,
  addDays,
  addMonths,
  currency as toCurrency,
  endOfMonth,
  monthsBetween,
  startOfMonth,
} from '@fincore/shared';
import { buildBalanceSheet, type BalanceSheetReport } from './balance-sheet/build.js';
import { queryRoleBalances, type BalanceSheetQuery } from './balance-sheet/query.js';
import { buildCashFlow, type CashFlowGrouping, type CashFlowReport } from './cashflow/build.js';
import {
  queryCashBalance,
  queryCashFlowFacts,
  queryCashPosition,
  type CashFlowScope,
} from './cashflow/query.js';
import { CLOSING_CASH_CODE, NET_FLOW_CODE, NON_CASH_CODE } from './cashflow/structure.js';
import { buildPnl, type PnlGrouping, type PnlReport } from './pnl/build.js';
import {
  queryEquityMovement,
  queryLedgerLines,
  queryPnlFacts,
  type LedgerLine,
  type LedgerLineQuery,
  type PnlPeriod,
  type PnlScope,
} from './pnl/query.js';
import { NET_PROFIT_CODE } from './pnl/structure.js';

export interface PnlQuery extends PnlScope {
  readonly grouping?: PnlGrouping;
  /**
   * Period to compare against. Omit for no comparison; pass `'prior'` for the
   * equally long period ending the day before `from`.
   */
  readonly compareTo?: PnlPeriod | 'prior';
}

export interface PnlReconciliation {
  readonly currency: string;
  readonly netProfit: Money;
  readonly equityChange: Money;
  readonly contributions: Money;
  readonly broughtForward: Money;
  readonly draws: Money;
  /**
   * equityChange − contributions − broughtForward + draws − netProfit.
   * Zero, or there is a bug upstream.
   */
  readonly residual: Money;
  readonly isReconciled: boolean;
}

export interface CashFlowQuery extends CashFlowScope {
  readonly grouping?: CashFlowGrouping;
}

export interface CashFlowReconciliation {
  readonly currency: string;
  /** What the statement says the period moved. */
  readonly netFlow: Money;
  readonly nonCashChange: Money;
  /** Where the statement says the period ended. */
  readonly closingCash: Money;
  /** What the ledger's cash accounts actually hold on that date. */
  readonly ledgerCash: Money;
  /** closingCash − ledgerCash. Zero, or there is a bug upstream. */
  readonly residual: Money;
  readonly isReconciled: boolean;
}

export interface Reports {
  /**
   * One report per functional currency in scope. Consolidating across
   * currencies needs the presentation-currency policy of CLAUDE.md §5.
   */
  getBalanceSheet(query: BalanceSheetQuery): Promise<BalanceSheetReport[]>;
  getPnl(query: PnlQuery): Promise<PnlReport[]>;
  /** One statement per functional currency, with a column per month. */
  getCashFlow(query: CashFlowQuery): Promise<CashFlowReport[]>;
  /**
   * Checks the statement's closing cash against the ledger's own cash
   * balance — PRD §7.5's second reconciliation. A non-zero residual means a
   * movement was mis-dated or mis-filtered, never something to plug.
   */
  reconcileCashFlow(scope: CashFlowScope): Promise<CashFlowReconciliation[]>;
  /** The lines behind one report figure, with their source markers (I3). */
  getLedgerLines(query: LedgerLineQuery): Promise<readonly LedgerLine[]>;
  /**
   * Checks net profit against the movement in equity. This is the mechanism
   * that proves the reports agree with the ledger; a non-zero residual is a
   * bug upstream, never something to plug.
   */
  reconcilePnl(scope: PnlScope): Promise<PnlReconciliation[]>;
}

/**
 * The period a user means by "previous". Calendar-aware on purpose: for a whole
 * month, quarter or year it returns the previous one, because an equal-day-count
 * window would put March's comparison at 29 January — technically 30 days back
 * and useless on a report. Anything that is not a whole-month span falls back to
 * an equally long window, and callers who want something else pass `compareTo`.
 */
export function priorPeriod(period: PnlPeriod): PnlPeriod {
  const isWholeMonths =
    period.from === startOfMonth(period.from) && period.to === endOfMonth(period.to);

  if (isWholeMonths) {
    const to = addDays(startOfMonth(period.from), -1);
    const months = monthsBetween(period.from, period.to) + 1;
    return { from: startOfMonth(addMonths(to, -(months - 1))), to };
  }

  const to = addDays(period.from, -1);
  const lengthInDays = Math.round(
    (Date.parse(`${period.to}T00:00:00Z`) - Date.parse(`${period.from}T00:00:00Z`)) / 86_400_000,
  );
  return { from: addDays(to, -lengthInDays), to };
}

/** Read-only projections over `journal_*`. This package never writes. */
export function createReports(db: Database): Reports {
  return {
    async getBalanceSheet(query) {
      const sets = await queryRoleBalances(db, query);
      return sets.map((set) =>
        buildBalanceSheet(set.balances, {
          asOf: query.asOf,
          currency: toCurrency(set.currency),
        }),
      );
    },

    async getPnl(query) {
      const grouping = query.grouping ?? 'none';
      const comparison =
        query.compareTo === undefined
          ? null
          : query.compareTo === 'prior'
            ? priorPeriod(query)
            : query.compareTo;

      const [sets, priorSets] = await Promise.all([
        queryPnlFacts(db, query),
        comparison === null
          ? Promise.resolve([])
          : queryPnlFacts(db, { ...query, from: comparison.from, to: comparison.to }),
      ]);

      return sets.map((set) =>
        buildPnl(
          set.facts,
          {
            from: query.from,
            to: query.to,
            currency: toCurrency(set.currency),
            grouping,
            comparison,
          },
          priorSets.find((prior) => prior.currency === set.currency)?.facts ?? [],
        ),
      );
    },

    async getCashFlow(query) {
      const grouping = query.grouping ?? 'none';
      const [sets, positions] = await Promise.all([
        queryCashFlowFacts(db, query),
        queryCashPosition(db, query),
      ]);

      // A currency can have an opening balance and no movement at all, or
      // movement and no opening balance; the statement owes a column either
      // way, so the two sides are unioned rather than joined.
      const currencies = [
        ...new Set([...sets.map((set) => set.currency), ...positions.map((set) => set.currency)]),
      ].sort();

      return currencies.map((code) => {
        const currency = toCurrency(code);
        const position = positions.find((set) => set.currency === code)?.position ?? {
          openingCash: Money.zero(currency),
          closingCash: Money.zero(currency),
          nonCashByPeriod: new Map(),
        };
        return buildCashFlow(sets.find((set) => set.currency === code)?.facts ?? [], {
          from: query.from,
          to: query.to,
          currency,
          grouping,
          position,
        });
      });
    },

    async reconcileCashFlow(scope) {
      const [statements, ledger] = await Promise.all([
        this.getCashFlow(scope),
        queryCashBalance(db, scope),
      ]);

      return statements.map((statement) => {
        const currency = statement.currency;
        const zero = Money.zero(currency);
        const rowTotal = (code: string): Money =>
          statement.rows.find((row) => row.code === code)?.total ?? zero;

        const closingCash = rowTotal(CLOSING_CASH_CODE);
        const ledgerCash = ledger.find((row) => row.currency === currency)?.balance ?? zero;
        const residual = closingCash.minus(ledgerCash);

        return {
          currency,
          netFlow: rowTotal(NET_FLOW_CODE),
          nonCashChange: rowTotal(NON_CASH_CODE),
          closingCash,
          ledgerCash,
          residual,
          isReconciled: residual.isZero(),
        };
      });
    },

    getLedgerLines(query) {
      return queryLedgerLines(db, query);
    },

    async reconcilePnl(scope) {
      const [movements, pnls] = await Promise.all([
        queryEquityMovement(db, scope),
        this.getPnl(scope),
      ]);

      return movements.map((movement) => {
        const c = toCurrency(movement.currency);
        const netProfit =
          pnls
            .find((report) => report.currency === movement.currency)
            ?.rows.find((row) => row.code === NET_PROFIT_CODE)?.amount ?? Money.zero(c);
        const equityChange = movement.closingEquity.minus(movement.openingEquity);
        // ΔEquity = net profit + contributions + broughtForward − draws.
        const residual = equityChange
          .minus(movement.contributions)
          .minus(movement.broughtForward)
          .plus(movement.draws)
          .minus(netProfit);
        return {
          currency: movement.currency,
          netProfit,
          equityChange,
          contributions: movement.contributions,
          broughtForward: movement.broughtForward,
          draws: movement.draws,
          residual,
          isReconciled: residual.isZero(),
        };
      });
    },
  };
}

// The structures, builders and labels — everything with no database behind it.
export * from './structure.js';

// The query layer. These touch `@fincore/db`, so a browser bundle must import
// `@fincore/reports/structure` instead of this entry point.
export { queryRoleBalances } from './balance-sheet/query.js';
export type { BalanceSheetQuery, RoleBalanceSet } from './balance-sheet/query.js';
export { queryCashBalance, queryCashFlowFacts, queryCashPosition } from './cashflow/query.js';
export type { CashFlowFactSet, CashFlowScope, CashPositionSet } from './cashflow/query.js';
export { queryEquityMovement, queryLedgerLines, queryPnlFacts } from './pnl/query.js';
export type {
  EquityMovement,
  LedgerLine,
  LedgerLineQuery,
  PnlFactSet,
  PnlPeriod,
  PnlScope,
} from './pnl/query.js';
