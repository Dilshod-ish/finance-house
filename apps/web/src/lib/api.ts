import { readConfig } from './config';

/** Mirrors the API's wire shapes. Amounts are strings, never numbers (I7). */
export interface MoneyDto {
  readonly amount: string;
  readonly currency: string;
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

export interface BalanceSheetLineDto {
  readonly code: string;
  readonly labelKey: string;
  readonly side: string;
  readonly level: number;
  readonly isTotal: boolean;
  readonly amount: MoneyDto;
  readonly isDrillable: boolean;
}

export interface BalanceSheetDto {
  readonly asOf: string;
  readonly currency: string;
  readonly lines: readonly BalanceSheetLineDto[];
  readonly isBalanced: boolean;
  readonly difference: MoneyDto;
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

export interface CashFlowReconciliationDto {
  readonly currency: string;
  readonly netFlow: MoneyDto;
  readonly nonCashChange: MoneyDto;
  readonly closingCash: MoneyDto;
  readonly ledgerCash: MoneyDto;
  readonly residual: MoneyDto;
  readonly isReconciled: boolean;
}

export interface LegalEntityDto {
  readonly id: string;
  readonly name: string;
  readonly functionalCurrency: string;
  readonly legalForm: string | null;
}

/** Thrown so a screen can render its error state; never swallowed. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * One request. No retry and no fallback value: a report that silently shows
 * stale or empty figures because a call failed is the worst outcome here, so
 * failures propagate to the error state.
 */
export async function apiGet<T>(path: string, search: URLSearchParams): Promise<T> {
  const { apiBaseUrl, orgId } = readConfig();
  const url = `${apiBaseUrl}${path}?${search.toString()}`;
  const response = await fetch(url, {
    headers: { 'x-fincore-org': orgId, accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ApiError(response.status, path, `${path} answered ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

export const getPnl = (search: URLSearchParams): Promise<{ reports: PnlDto[] }> =>
  apiGet('/v1/reports/pnl', search);

export const getBalanceSheet = (search: URLSearchParams): Promise<{ reports: BalanceSheetDto[] }> =>
  apiGet('/v1/reports/balance-sheet', search);

export const getCashFlow = (search: URLSearchParams): Promise<{ reports: CashFlowDto[] }> =>
  apiGet('/v1/reports/cash-flow', search);

export const getCashFlowReconciliation = (
  search: URLSearchParams,
): Promise<{ checks: CashFlowReconciliationDto[] }> =>
  apiGet('/v1/reports/cash-flow/reconciliation', search);

export const getReconciliation = (
  search: URLSearchParams,
): Promise<{ checks: ReconciliationDto[] }> => apiGet('/v1/reports/reconciliation', search);

export const getDrilldown = (search: URLSearchParams): Promise<{ lines: LedgerLineDto[] }> =>
  apiGet('/v1/reports/drilldown', search);

export const getLegalEntities = (): Promise<{ legalEntities: LegalEntityDto[] }> =>
  apiGet('/v1/meta/legal-entities', new URLSearchParams());
