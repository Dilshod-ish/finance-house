import type {
  BankDescriptor,
  FxSource,
  ProviderDescriptor,
  ReportPreset,
  StatementParserDescriptor,
} from '@fincore/region-pack-contract';

/**
 * Open banking barely exists in Uzbekistan, so the strategy is parser-first
 * (architecture §4.1). These are declarations of what exists; the executable
 * parsers land in `packages/importers` and are resolved by `id`.
 */
export const BANKS: readonly BankDescriptor[] = [
  { id: 'bank.tbc', bankCode: '01183', nameKey: 'bank.tbc', priority: 2, hasPublicApi: true },
  { id: 'bank.anor', bankCode: '01181', nameKey: 'bank.anor', priority: 2, hasPublicApi: true },
  {
    id: 'bank.kapital',
    bankCode: '00974',
    nameKey: 'bank.kapital',
    priority: 2,
    hasPublicApi: false,
  },
  { id: 'bank.uzum', bankCode: '01182', nameKey: 'bank.uzum', priority: 2, hasPublicApi: true },
  { id: 'bank.nbu', bankCode: '00450', nameKey: 'bank.nbu', priority: 3, hasPublicApi: false },
  {
    id: 'bank.ipoteka',
    bankCode: '00811',
    nameKey: 'bank.ipoteka',
    priority: 3,
    hasPublicApi: false,
  },
];

export const STATEMENT_PARSERS: readonly StatementParserDescriptor[] = [
  { id: 'parser.1c_exchange', format: 'txt_1c', nameKey: 'parser.1cExchange', bankCodes: [] },
  { id: 'parser.xlsx', format: 'xlsx', nameKey: 'parser.xlsx', bankCodes: [] },
  { id: 'parser.csv', format: 'csv', nameKey: 'parser.csv', bankCodes: [] },
  { id: 'parser.pdf_ocr', format: 'pdf', nameKey: 'parser.pdfOcr', bankCodes: [] },
];

export const E_INVOICE_PROVIDERS: readonly ProviderDescriptor[] = [
  { id: 'einvoice.didox', nameKey: 'einvoice.didox', priority: 1 },
  { id: 'einvoice.faktura', nameKey: 'einvoice.faktura', priority: 1 },
];

export const TAX_AUTHORITY: ProviderDescriptor = {
  id: 'tax.soliq',
  nameKey: 'taxAuthority.soliq',
  priority: 3,
};

/** Central Bank of Uzbekistan publishes one rate set per business day. */
export const FX_SOURCE: FxSource = {
  id: 'fx.cbu',
  nameKey: 'fxSource.cbu',
  quoteCurrency: 'UZS',
  cadence: 'business_daily',
  endpoint: 'https://cbu.uz/ru/arkhiv-kursov-valyut/json/',
};

export const REPORT_PRESETS: readonly ReportPreset[] = [
  { id: 'preset.cashFlowMonthly', nameKey: 'preset.cashFlowMonthly', report: 'cash_flow' },
  { id: 'preset.pnlMonthly', nameKey: 'preset.pnlMonthly', report: 'pnl' },
  { id: 'preset.balanceSheet', nameKey: 'preset.balanceSheet', report: 'balance_sheet' },
  { id: 'preset.paymentCalendar', nameKey: 'preset.paymentCalendar', report: 'payment_calendar' },
];
