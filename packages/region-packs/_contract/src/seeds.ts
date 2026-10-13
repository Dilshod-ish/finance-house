import type { AccountKind, FlowType, GlAccountType, Side } from '@fincore/shared';

/**
 * What the platform needs to *find* an account for, independent of a country's
 * numbering. I5 resolves cash accounts through `cash`; the seed and later the
 * reports resolve everything else the same way, so no code outside a pack ever
 * names a chart-of-accounts code.
 */
export type GlAccountRole =
  | 'cash'
  | 'receivable'
  | 'payable'
  | 'payroll_payable'
  | 'revenue'
  | 'expense'
  | 'fx_difference'
  | 'retained_earnings';

/**
 * One row of a chart-of-accounts template. Materialised per organization at
 * onboarding — `gl_account.org_id` is NOT NULL, there are no shared rows
 * (ADR-0002).
 */
export interface GlAccountSeed {
  readonly code: string;
  readonly nameKey: string;
  readonly type: GlAccountType;
  readonly normalSide: Side;
  /** Null when nothing outside the pack needs to resolve this account. */
  readonly role: GlAccountRole | null;
  /** Set only on `role: 'cash'` accounts: which kind of money sits here. */
  readonly accountKind: AccountKind | null;
}

/** One user-visible article, bound to a GL account and a P&L line. */
export interface ArticleSeed {
  readonly key: string;
  readonly nameKey: string;
  readonly flowType: FlowType;
  /** `gl_account.code` this article posts to. */
  readonly glAccountCode: string;
  readonly parentKey: string | null;
  readonly pnlLineCode: string | null;
  /** Percent as a decimal string, or null when the article is out of scope. */
  readonly vatRatePercent: string | null;
  readonly sortOrder: number;
}

/** A ready-made article set for one industry (PRD M1: 40–60 articles). */
export interface ArticleTemplate {
  readonly industry: string;
  readonly nameKey: string;
  readonly articles: readonly ArticleSeed[];
}

export interface LegalForm {
  readonly code: string;
  readonly nameKey: string;
  /** An individual entrepreneur is taxed and reported differently. */
  readonly isIndividual: boolean;
  /** Whether the form may register for VAT at all. */
  readonly canRegisterForVat: boolean;
}
