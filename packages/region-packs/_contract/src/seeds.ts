import type { AccountKind, FlowType, GlAccountRole, GlAccountType, Side } from '@fincore/shared';

// The role vocabulary lives in @fincore/shared (the schema turns it into a
// CHECK constraint); re-exported so pack authors have one import site.
export { GL_ACCOUNT_ROLES, ROLE_ACCOUNT_TYPE, type GlAccountRole } from '@fincore/shared';

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
  /**
   * Mandatory: an account with no role cannot be placed on a balance sheet or
   * a P&L line, so it would silently fall out of every report.
   */
  readonly role: GlAccountRole;
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
