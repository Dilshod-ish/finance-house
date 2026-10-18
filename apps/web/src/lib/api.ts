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
export async function apiGet<T>(path: string, search: URLSearchParams, orgId: string): Promise<T> {
  const { apiBaseUrl } = readConfig();
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

export const getPnl = (search: URLSearchParams, orgId: string): Promise<{ reports: PnlDto[] }> =>
  apiGet('/v1/reports/pnl', search, orgId);

export const getBalanceSheet = (
  search: URLSearchParams,
  orgId: string,
): Promise<{ reports: BalanceSheetDto[] }> => apiGet('/v1/reports/balance-sheet', search, orgId);

export const getCashFlow = (
  search: URLSearchParams,
  orgId: string,
): Promise<{ reports: CashFlowDto[] }> => apiGet('/v1/reports/cash-flow', search, orgId);

export const getCashFlowReconciliation = (
  search: URLSearchParams,
  orgId: string,
): Promise<{ checks: CashFlowReconciliationDto[] }> =>
  apiGet('/v1/reports/cash-flow/reconciliation', search, orgId);

export const getReconciliation = (
  search: URLSearchParams,
  orgId: string,
): Promise<{ checks: ReconciliationDto[] }> => apiGet('/v1/reports/reconciliation', search, orgId);

export const getDrilldown = (
  search: URLSearchParams,
  orgId: string,
): Promise<{ lines: LedgerLineDto[] }> => apiGet('/v1/reports/drilldown', search, orgId);

export const getLegalEntities = (orgId: string): Promise<{ legalEntities: LegalEntityDto[] }> =>
  apiGet('/v1/meta/legal-entities', new URLSearchParams(), orgId);

export interface ArticleDto {
  readonly id: string;
  readonly name: string;
  readonly flowType: string;
}

export interface DirectionDto {
  readonly id: string;
  readonly name: string;
}

export const getArticles = (orgId: string): Promise<{ articles: ArticleDto[] }> =>
  apiGet('/v1/meta/articles', new URLSearchParams(), orgId);

export const getDirections = (orgId: string): Promise<{ directions: DirectionDto[] }> =>
  apiGet('/v1/meta/directions', new URLSearchParams(), orgId);

export interface InboxRowDto {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly cashDate: string;
  readonly direction: 'in' | 'out';
  readonly amount: MoneyDto;
  readonly counterpartyName: string | null;
  readonly documentNumber: string | null;
  readonly purpose: string | null;
}

export interface BatchSummaryDto {
  readonly id: string;
  readonly fileName: string;
  readonly accountName: string;
  readonly rowCount: number;
  readonly postedCount: number;
  readonly duplicateCount: number;
  readonly status: 'imported' | 'reverted';
  readonly createdAt: string;
}

export interface ImportResultDto {
  readonly batchId: string;
  readonly rowCount: number;
  readonly postedCount: number;
  readonly unassignedCount: number;
  readonly unknownArticles: readonly string[];
  readonly duplicates: readonly {
    readonly rowNumber: number | null;
    readonly cashDate: string;
    readonly amount: MoneyDto;
    readonly documentNumber: string | null;
    readonly existingOperationId: string;
  }[];
}

/** A refusal, with the validator's findings when the file was the problem. */
export interface OperationsProblemDto {
  readonly severity: 'error' | 'warning';
  readonly sheet: string;
  readonly row: number | null;
  readonly column: string | null;
  readonly message: { readonly uz: string; readonly ru: string; readonly en: string };
}

export interface OperationsErrorDto {
  readonly error: string;
  readonly message: string;
  readonly problems?: readonly OperationsProblemDto[];
}

export const getInbox = (orgId: string): Promise<{ operations: InboxRowDto[] }> =>
  apiGet('/v1/operations/inbox', new URLSearchParams(), orgId);

export const getBatches = (orgId: string): Promise<{ batches: BatchSummaryDto[] }> =>
  apiGet('/v1/operations/batches', new URLSearchParams(), orgId);

/**
 * A write. Unlike `apiGet` this returns the refusal body instead of throwing:
 * the whole point of the import screen is to show the person which row of
 * which sheet to fix, and an exception would turn that into a blank error page.
 */
export async function apiPost(
  path: string,
  orgId: string,
  body: BodyInit,
  contentType: string,
  extraHeaders: Readonly<Record<string, string>> = {},
): Promise<
  { ok: true; value: unknown } | { ok: false; status: number; error: OperationsErrorDto }
> {
  const { apiBaseUrl } = readConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'x-fincore-org': orgId,
      'content-type': contentType,
      accept: 'application/json',
      ...extraHeaders,
    },
    body,
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    return { ok: false, status: response.status, error: payload as OperationsErrorDto };
  }
  return { ok: true, value: payload };
}

export interface OrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
}

export const getOrganization = (orgId: string): Promise<OrganizationDto> =>
  apiGet('/v1/meta/organization', new URLSearchParams(), orgId);
