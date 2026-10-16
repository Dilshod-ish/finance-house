import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OrgGuard } from '../org-context/org.guard.js';
import { OrgId } from '../org-context/org-id.decorator.js';
import { parseQuery } from '../http/query.js';
import {
  balanceSheetQuerySchema,
  cashFlowQuerySchema,
  drilldownQuerySchema,
  pnlQuerySchema,
  reconciliationQuerySchema,
} from './dto.js';
import {
  balanceSheetDto,
  cashFlowDto,
  cashFlowReconciliationDto,
  ledgerLineDto,
  pnlDto,
  reconciliationDto,
  type BalanceSheetDto,
  type CashFlowDto,
  type CashFlowReconciliationDto,
  type LedgerLineDto,
  type PnlDto,
  type ReconciliationDto,
} from './reports.presenter.js';
import { ReportsService } from './reports.service.js';

/**
 * One report per functional currency, always an array: consolidating across
 * currencies needs the presentation-currency policy of CLAUDE.md §5, which does
 * not exist yet. Returning the first one would quietly hide a second entity.
 */
@Controller('v1/reports')
@UseGuards(OrgGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('balance-sheet')
  async balanceSheet(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ reports: BalanceSheetDto[] }> {
    const query = parseQuery(balanceSheetQuerySchema, raw);
    const reports = await this.service.balanceSheet(orgId, query);
    return { reports: reports.map(balanceSheetDto) };
  }

  @Get('pnl')
  async pnl(@OrgId() orgId: string, @Query() raw: unknown): Promise<{ reports: PnlDto[] }> {
    const query = parseQuery(pnlQuerySchema, raw);
    const reports = await this.service.pnl(orgId, query);
    return { reports: reports.map(pnlDto) };
  }

  @Get('cash-flow')
  async cashFlow(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ reports: CashFlowDto[] }> {
    const query = parseQuery(cashFlowQuerySchema, raw);
    const reports = await this.service.cashFlow(orgId, query);
    return { reports: reports.map(cashFlowDto) };
  }

  @Get('cash-flow/reconciliation')
  async cashFlowReconciliation(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ checks: CashFlowReconciliationDto[] }> {
    const query = parseQuery(reconciliationQuerySchema, raw);
    const checks = await this.service.cashFlowReconciliation(orgId, query);
    return { checks: checks.map(cashFlowReconciliationDto) };
  }

  @Get('reconciliation')
  async reconciliation(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ checks: ReconciliationDto[] }> {
    const query = parseQuery(reconciliationQuerySchema, raw);
    const checks = await this.service.reconciliation(orgId, query);
    return { checks: checks.map(reconciliationDto) };
  }

  @Get('drilldown')
  async drilldown(
    @OrgId() orgId: string,
    @Query() raw: unknown,
  ): Promise<{ lines: LedgerLineDto[] }> {
    const query = parseQuery(drilldownQuerySchema, raw);
    const lines = await this.service.drilldown(orgId, query);
    return { lines: lines.map(ledgerLineDto) };
  }
}
