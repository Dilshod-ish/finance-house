import type { Database } from '@fincore/db';
import { currency as toCurrency } from '@fincore/shared';
import { buildBalanceSheet, type BalanceSheetReport } from './balance-sheet/build.js';
import { queryRoleBalances, type BalanceSheetQuery } from './balance-sheet/query.js';

export interface Reports {
  /**
   * One report per functional currency in scope. Consolidating across
   * currencies needs the presentation-currency policy of CLAUDE.md §5.
   */
  getBalanceSheet(query: BalanceSheetQuery): Promise<BalanceSheetReport[]>;
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
  };
}

export { buildBalanceSheet } from './balance-sheet/build.js';
export type { BalanceSheetLine, BalanceSheetReport, RoleBalances } from './balance-sheet/build.js';
export { queryRoleBalances } from './balance-sheet/query.js';
export type { BalanceSheetQuery, RoleBalanceSet } from './balance-sheet/query.js';
export * from './balance-sheet/structure.js';
export { REPORT_MESSAGES, REPORT_MESSAGE_KEYS, type ReportMessageKey } from './messages.js';
