import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Database } from '@fincore/db';
import type { GlAccountRole } from '@fincore/shared';
import {
  BALANCE_SHEET,
  CASH_FLOW,
  PNL,
  contraRolesForCashFlowLine,
  createReports,
  rolesForBalanceSheetLine,
  rolesForPnlLine,
  type BalanceSheetReport,
  type CashFlowReconciliation,
  type CashFlowReport,
  type LedgerLine,
  type PnlReconciliation,
  type PnlReport,
  type Reports,
} from '@fincore/reports';
import { DATABASE } from '../db/db.module.js';
import type {
  BalanceSheetQueryDto,
  CashFlowQueryDto,
  DrilldownQueryDto,
  PnlQueryDto,
  ReconciliationQueryDto,
} from './dto.js';

/**
 * The seam between HTTP and the domain. It assembles arguments and nothing
 * else: every figure comes from `@fincore/reports`, because computing one here
 * would be the anti-pattern CLAUDE.md §9 names first.
 */
@Injectable()
export class ReportsService {
  private readonly reports: Reports;

  constructor(@Inject(DATABASE) db: Database) {
    this.reports = createReports(db);
  }

  balanceSheet(orgId: string, query: BalanceSheetQueryDto): Promise<BalanceSheetReport[]> {
    return this.reports.getBalanceSheet({
      orgId,
      asOf: query.asOf,
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
    });
  }

  pnl(orgId: string, query: PnlQueryDto): Promise<PnlReport[]> {
    return this.reports.getPnl({
      orgId,
      from: query.from,
      to: query.to,
      grouping: query.grouping,
      ...(query.compareTo === 'prior' ? { compareTo: 'prior' as const } : {}),
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
    });
  }

  cashFlow(orgId: string, query: CashFlowQueryDto): Promise<CashFlowReport[]> {
    return this.reports.getCashFlow({
      orgId,
      from: query.from,
      to: query.to,
      grouping: query.grouping,
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
      ...(query.accountId === undefined ? {} : { accountIds: query.accountId }),
    });
  }

  cashFlowReconciliation(
    orgId: string,
    query: ReconciliationQueryDto,
  ): Promise<CashFlowReconciliation[]> {
    return this.reports.reconcileCashFlow({
      orgId,
      from: query.from,
      to: query.to,
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
      ...(query.accountId === undefined ? {} : { accountIds: query.accountId }),
    });
  }

  reconciliation(orgId: string, query: ReconciliationQueryDto): Promise<PnlReconciliation[]> {
    return this.reports.reconcilePnl({
      orgId,
      from: query.from,
      to: query.to,
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
    });
  }

  /**
   * The lines behind one figure (I3). The client names a report line; the roles
   * come from that report's structure here, so a caller cannot widen what it
   * reads by asking for roles the report never showed it.
   */
  drilldown(orgId: string, query: DrilldownQueryDto): Promise<readonly LedgerLine[]> {
    const roles = this.rolesFor(query.report, query.line);
    return this.reports.getLedgerLines({
      orgId,
      to: query.to,
      roles,
      limit: query.limit,
      ...(query.from === undefined ? {} : { from: query.from }),
      ...(query.legalEntityId === undefined ? {} : { legalEntityIds: query.legalEntityId }),
      ...(query.articleId === undefined ? {} : { articleId: query.articleId }),
      ...(query.directionId === undefined ? {} : { directionId: query.directionId }),
    });
  }

  private rolesFor(report: DrilldownQueryDto['report'], line: string): readonly GlAccountRole[] {
    // Checked against the structure rather than caught from it: a try/catch
    // here would report a real bug inside the resolver as the client's mistake
    // (CLAUDE.md §9 — never swallow an error in a financial path).
    const structures = {
      pnl: PNL,
      'balance-sheet': BALANCE_SHEET,
      'cash-flow': CASH_FLOW,
    } as const;
    const resolvers = {
      pnl: rolesForPnlLine,
      'balance-sheet': rolesForBalanceSheetLine,
      // A cash-flow line resolves to the roles on the *other* side of each
      // entry, because that is what its section means.
      'cash-flow': contraRolesForCashFlowLine,
    } as const;

    if (!structures[report].some((spec) => spec.code === line)) {
      throw new BadRequestException({
        error: 'unknown_report_line',
        message: `No line '${line}' in the ${report} report.`,
      });
    }
    return resolvers[report](line);
  }
}
