/**
 * The pure half of this package: report structures, the builders over them, and
 * the line labels. No database, no `@fincore/db`, nothing from Node.
 *
 * It exists so a browser bundle can render a report's shape and labels without
 * pulling the query layer — and with it `postgres` and `node:url` — into the
 * client. The main entry point keeps both halves for server callers.
 */
export { buildBalanceSheet } from './balance-sheet/build.js';
export type { BalanceSheetLine, BalanceSheetReport, RoleBalances } from './balance-sheet/build.js';
export * from './balance-sheet/structure.js';

export { buildPnl, matches } from './pnl/build.js';
export type {
  BuildPnlOptions,
  PnlBreakdownRow,
  PnlFact,
  PnlGrouping,
  PnlReport,
  PnlRow,
} from './pnl/build.js';
export * from './pnl/structure.js';

export { rolesForLine, type RoleSource } from './structure-roles.js';

export { REPORT_MESSAGES, REPORT_MESSAGE_KEYS, type ReportMessageKey } from './messages.js';
