import type {
  BalanceSheetReport,
  CashFlowReconciliation,
  CashFlowReport,
  LedgerLine,
  PnlReconciliation,
  PnlReport,
} from '@fincore/reports';
import { maybeMoney, money, type MoneyDto } from '../http/serialize.js';

/**
 * Wire shapes. Labels travel as locale keys, never as text (CLAUDE.md §9), and
 * every amount is a string (I7). Nothing here rounds or formats: that happens
 * once, in the UI, at presentation.
 */
export interface BalanceSheetLineDto {
  readonly code: string;
  readonly labelKey: string;
  readonly side: string;
  readonly level: number;
  readonly isTotal: boolean;
  readonly amount: MoneyDto;
  /** False for a section total, which has no lines of its own to show. */
  readonly isDrillable: boolean;
}

export interface BalanceSheetDto {
  readonly asOf: string;
  readonly currency: string;
  readonly lines: readonly BalanceSheetLineDto[];
  readonly isBalanced: boolean;
  readonly difference: MoneyDto;
}

export function balanceSheetDto(report: BalanceSheetReport): BalanceSheetDto {
  return {
    asOf: report.asOf,
    currency: report.currency,
    isBalanced: report.isBalanced,
    difference: money(report.difference),
    lines: report.lines.map((line) => ({
      code: line.code,
      labelKey: line.labelKey,
      side: line.side,
      level: line.level,
      isTotal: line.isTotal,
      amount: money(line.amount),
      isDrillable: !line.isTotal,
    })),
  };
}

export interface PnlBreakdownDto {
  readonly articleId: string | null;
  readonly articleName: string | null;
  readonly directionId: string | null;
  readonly directionName: string | null;
  readonly amount: MoneyDto;
  readonly priorAmount: MoneyDto | null;
}

export interface PnlRowDto {
  readonly code: string;
  readonly labelKey: string;
  readonly level: number;
  readonly kind: string;
  readonly amount: MoneyDto | null;
  readonly percent: string | null;
  readonly priorAmount: MoneyDto | null;
  readonly priorPercent: string | null;
  readonly delta: MoneyDto | null;
  readonly deltaPercent: string | null;
  readonly breakdown: readonly PnlBreakdownDto[];
}

export interface PnlDto {
  readonly from: string;
  readonly to: string;
  readonly comparison: { readonly from: string; readonly to: string } | null;
  readonly currency: string;
  readonly grouping: string;
  readonly rows: readonly PnlRowDto[];
}

export function pnlDto(report: PnlReport): PnlDto {
  return {
    from: report.from,
    to: report.to,
    comparison: report.comparison,
    currency: report.currency,
    grouping: report.grouping,
    rows: report.rows.map((row) => ({
      code: row.code,
      labelKey: row.labelKey,
      level: row.level,
      kind: row.kind,
      amount: maybeMoney(row.amount),
      percent: row.percent,
      priorAmount: maybeMoney(row.priorAmount),
      priorPercent: row.priorPercent,
      delta: maybeMoney(row.delta),
      deltaPercent: row.deltaPercent,
      breakdown: row.breakdown.map((part) => ({
        articleId: part.articleId,
        articleName: part.articleName,
        directionId: part.directionId,
        directionName: part.directionName,
        amount: money(part.amount),
        priorAmount: maybeMoney(part.priorAmount),
      })),
    })),
  };
}

export interface ReconciliationDto {
  readonly currency: string;
  readonly netProfit: MoneyDto;
  readonly equityChange: MoneyDto;
  readonly contributions: MoneyDto;
  readonly broughtForward: MoneyDto;
  readonly draws: MoneyDto;
  readonly residual: MoneyDto;
  readonly isReconciled: boolean;
}

export function reconciliationDto(check: PnlReconciliation): ReconciliationDto {
  return {
    currency: check.currency,
    netProfit: money(check.netProfit),
    equityChange: money(check.equityChange),
    contributions: money(check.contributions),
    broughtForward: money(check.broughtForward),
    draws: money(check.draws),
    residual: money(check.residual),
    isReconciled: check.isReconciled,
  };
}

export interface CashFlowBreakdownDto {
  readonly key: string;
  readonly label: string | null;
  readonly articleId: string | null;
  readonly directionId: string | null;
  readonly counterpartyId: string | null;
  readonly accountId: string;
  readonly amounts: readonly MoneyDto[];
  readonly total: MoneyDto;
}

export interface CashFlowRowDto {
  readonly code: string;
  readonly labelKey: string;
  readonly level: number;
  readonly kind: string;
  /** One figure per period column, in `periods` order. */
  readonly amounts: readonly MoneyDto[];
  readonly total: MoneyDto;
  readonly isDrillable: boolean;
  readonly breakdown: readonly CashFlowBreakdownDto[];
}

export interface CashFlowDto {
  readonly from: string;
  readonly to: string;
  readonly currency: string;
  readonly grouping: string;
  readonly periods: readonly string[];
  readonly rows: readonly CashFlowRowDto[];
}

export function cashFlowDto(report: CashFlowReport): CashFlowDto {
  return {
    from: report.from,
    to: report.to,
    currency: report.currency,
    grouping: report.grouping,
    periods: [...report.periods],
    rows: report.rows.map((row) => ({
      code: row.code,
      labelKey: row.labelKey,
      level: row.level,
      kind: row.kind,
      amounts: row.amounts.map(money),
      total: money(row.total),
      // A balance is a position and a non-cash line has no movement behind it
      // in the cash sense; neither opens a list of cash entries.
      isDrillable: row.kind === 'flow' || row.kind === 'subtotal',
      breakdown: row.breakdown.map((part) => ({
        key: part.key,
        label: part.label,
        articleId: part.articleId,
        directionId: part.directionId,
        counterpartyId: part.counterpartyId,
        accountId: part.accountId,
        amounts: part.amounts.map(money),
        total: money(part.total),
      })),
    })),
  };
}

export interface CashFlowReconciliationDto {
  readonly currency: string;
  readonly netFlow: MoneyDto;
  readonly nonCashChange: MoneyDto;
  readonly closingCash: MoneyDto;
  readonly ledgerCash: MoneyDto;
  readonly residual: MoneyDto;
  readonly isReconciled: boolean;
}

export function cashFlowReconciliationDto(
  check: CashFlowReconciliation,
): CashFlowReconciliationDto {
  return {
    currency: check.currency,
    netFlow: money(check.netFlow),
    nonCashChange: money(check.nonCashChange),
    closingCash: money(check.closingCash),
    ledgerCash: money(check.ledgerCash),
    residual: money(check.residual),
    isReconciled: check.isReconciled,
  };
}

export interface LedgerLineDto {
  readonly entryId: string;
  readonly accrualDate: string;
  readonly cashDate: string | null;
  readonly kind: string;
  readonly sourceType: string;
  readonly sourceId: string | null;
  readonly description: string | null;
  readonly glCode: string;
  readonly articleName: string | null;
  readonly directionName: string | null;
  readonly side: 'D' | 'C';
  readonly amountFunctional: MoneyDto;
  readonly memo: string | null;
}

export function ledgerLineDto(line: LedgerLine): LedgerLineDto {
  return {
    entryId: line.entryId,
    accrualDate: line.accrualDate,
    cashDate: line.cashDate,
    kind: line.kind,
    sourceType: line.sourceType,
    sourceId: line.sourceId,
    description: line.description,
    glCode: line.glCode,
    articleName: line.articleName,
    directionName: line.directionName,
    side: line.side,
    amountFunctional: money(line.amountFunctional),
    memo: line.memo,
  };
}
