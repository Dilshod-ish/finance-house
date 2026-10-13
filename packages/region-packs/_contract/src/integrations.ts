/**
 * Descriptors, not implementations. A pack declares *what* exists in its
 * country; the executable code lives where it belongs — statement parsers in
 * `packages/importers`, resolved by `id`. Declaring behavioural interfaces here
 * before those packages exist would be inventing an API we would rewrite.
 */
export interface ProviderDescriptor {
  readonly id: string;
  readonly nameKey: string;
  /** Rollout priority from architecture §4.1: 0 = P0. */
  readonly priority: 0 | 1 | 2 | 3;
}

export interface BankDescriptor extends ProviderDescriptor {
  /** National bank code used on `account.bank_code`. */
  readonly bankCode: string;
  readonly hasPublicApi: boolean;
}

export type StatementFormat = 'csv' | 'xlsx' | 'txt_1c' | 'pdf' | 'mt940' | 'camt053';

export interface StatementParserDescriptor {
  readonly id: string;
  readonly format: StatementFormat;
  readonly nameKey: string;
  /** Bank codes known to emit this format; empty means format-generic. */
  readonly bankCodes: readonly string[];
}

export interface FxSource {
  readonly id: string;
  readonly nameKey: string;
  /** Currency the published rates are quoted against. */
  readonly quoteCurrency: string;
  readonly cadence: 'daily' | 'business_daily';
  readonly endpoint: string;
}

export interface ReportPreset {
  readonly id: string;
  readonly nameKey: string;
  readonly report: 'cash_flow' | 'pnl' | 'balance_sheet' | 'payment_calendar';
}
