import type { LocaleConfig, Messages } from './locale.js';
import type { TaxRegime } from './tax.js';
import type { ArticleTemplate, GlAccountRole, GlAccountSeed, LegalForm } from './seeds.js';
import type {
  BankDescriptor,
  FxSource,
  ProviderDescriptor,
  ReportPreset,
  StatementParserDescriptor,
} from './integrations.js';

export type RegionCode = 'uz' | 'ru' | 'kz' | 'global';

/**
 * Everything country-specific, behind one interface (architecture §4). Nothing
 * outside a pack may name a tax rate, a bank or a legal form: that is what
 * makes the move to the next country a configuration change instead of a
 * rewrite.
 */
export interface RegionPack {
  readonly code: RegionCode;
  readonly countryCode: string;
  readonly locale: LocaleConfig;
  readonly currency: {
    readonly default: string;
    readonly symbolPosition: 'prefix' | 'suffix';
    /**
     * Currencies businesses in this country routinely transact in besides the
     * default. Multi-currency is an MVP requirement in Uzbekistan, not an
     * option (architecture §3), and the list belongs to the pack so no other
     * package hardcodes a currency (CLAUDE.md §9).
     */
    readonly common: readonly string[];
  };
  readonly legalForms: readonly LegalForm[];
  readonly taxRegimes: readonly TaxRegime[];
  readonly chartOfAccountsTemplate: readonly GlAccountSeed[];
  readonly articleTemplates: readonly ArticleTemplate[];
  readonly banks: readonly BankDescriptor[];
  readonly statementParsers: readonly StatementParserDescriptor[];
  readonly eInvoiceProviders: readonly ProviderDescriptor[];
  readonly taxAuthority: ProviderDescriptor | null;
  readonly fxSource: FxSource;
  readonly reportPresets: readonly ReportPreset[];
  /** Translations for every `*Key` the pack declares. */
  readonly messages: Messages;
}

export function legalFormByCode(pack: RegionPack, code: string): LegalForm | undefined {
  return pack.legalForms.find((form) => form.code === code);
}

export function taxRegimeByCode(pack: RegionPack, code: string): TaxRegime | undefined {
  return pack.taxRegimes.find((regime) => regime.code === code);
}

/** Every account carrying `role`, in template order. */
export function glAccountsByRole(pack: RegionPack, role: GlAccountRole): readonly GlAccountSeed[] {
  return pack.chartOfAccountsTemplate.filter((account) => account.role === role);
}

/** The GL account a money account of `kind` posts to (I5). */
export function cashGlAccountFor(pack: RegionPack, kind: string): GlAccountSeed | undefined {
  return pack.chartOfAccountsTemplate.find(
    (account) => account.role === 'cash' && account.accountKind === kind,
  );
}

export function articleTemplateFor(
  pack: RegionPack,
  industry: string,
): ArticleTemplate | undefined {
  return pack.articleTemplates.find((template) => template.industry === industry);
}
