import type { RegionPack } from '@fincore/region-pack-contract';
import { LEGAL_FORMS } from './legal-forms.js';
import { TAX_REGIMES } from './tax.js';
import { CHART_OF_ACCOUNTS } from './chart-of-accounts.js';
import { ARTICLE_TEMPLATES } from './articles.js';
import {
  BANKS,
  E_INVOICE_PROVIDERS,
  FX_SOURCE,
  REPORT_PRESETS,
  STATEMENT_PARSERS,
  TAX_AUTHORITY,
} from './integrations.js';
import { MESSAGES } from './messages.js';

/**
 * Uzbekistan, configuration only. No behaviour lives here yet: parsers,
 * connectors and the tax calendar arrive in their own packages and are
 * resolved by the ids declared above.
 */
export const uzRegionPack: RegionPack = {
  code: 'uz',
  countryCode: 'UZ',
  locale: {
    languages: ['uz', 'ru', 'en'],
    // Russian remains the working language of much of Uzbek business (PRD §4).
    defaultLanguage: 'ru',
    numberFormatLocale: 'uz-UZ',
    dateFormatLocale: 'uz-UZ',
    firstDayOfWeek: 1,
  },
  currency: { default: 'UZS', symbolPosition: 'suffix', common: ['USD', 'EUR', 'RUB', 'CNY'] },
  legalForms: LEGAL_FORMS,
  taxRegimes: TAX_REGIMES,
  chartOfAccountsTemplate: CHART_OF_ACCOUNTS,
  articleTemplates: ARTICLE_TEMPLATES,
  banks: BANKS,
  statementParsers: STATEMENT_PARSERS,
  eInvoiceProviders: E_INVOICE_PROVIDERS,
  taxAuthority: TAX_AUTHORITY,
  fxSource: FX_SOURCE,
  reportPresets: REPORT_PRESETS,
  messages: MESSAGES,
};

export default uzRegionPack;
export { LEGAL_FORMS, TAX_REGIMES, CHART_OF_ACCOUNTS, ARTICLE_TEMPLATES, MESSAGES };
export type { MessageKey } from './messages.js';
