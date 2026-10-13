import {
  cashGlAccountFor,
  glAccountsByRole,
  rateEffectiveOn,
  type GlAccountRole,
  type LegalForm,
  type RegionPack,
  type TaxRegime,
} from '@fincore/region-pack-contract';
import type { AccountKind, IsoDate } from '@fincore/shared';

/**
 * The seed never names a country's legal forms, tax regimes or account codes —
 * it describes what it wants ("a company on a VAT regime", "the receivable
 * account") and lets the pack decide what those are called. That is what makes
 * the same seed work when a `ru` or `kz` pack lands.
 */
export interface ResolvedProfile {
  readonly legalForm: LegalForm;
  readonly taxRegime: TaxRegime;
}

function regimeFor(
  pack: RegionPack,
  form: LegalForm,
  kind: 'vat' | 'turnover',
  on: IsoDate,
): TaxRegime {
  const regime = pack.taxRegimes.find(
    (candidate) =>
      candidate.legalForms.includes(form.code) &&
      rateEffectiveOn(candidate, kind, on) !== undefined,
  );
  if (regime === undefined) {
    throw new Error(
      `region pack ${pack.code} declares no ${kind} regime for legal form ${form.code} on ${on}`,
    );
  }
  return regime;
}

function formWhere(pack: RegionPack, isIndividual: boolean): LegalForm {
  const form = pack.legalForms.find((candidate) => candidate.isIndividual === isIndividual);
  if (form === undefined) {
    throw new Error(
      `region pack ${pack.code} declares no ${isIndividual ? 'individual' : 'company'} legal form`,
    );
  }
  return form;
}

/** A company on the VAT-and-profit regime. */
export function companyProfile(pack: RegionPack, on: IsoDate): ResolvedProfile {
  const legalForm = formWhere(pack, false);
  return { legalForm, taxRegime: regimeFor(pack, legalForm, 'vat', on) };
}

/** A sole trader on the turnover regime. */
export function soleTraderProfile(pack: RegionPack, on: IsoDate): ResolvedProfile {
  const legalForm = formWhere(pack, true);
  return { legalForm, taxRegime: regimeFor(pack, legalForm, 'turnover', on) };
}

/** The nth account carrying `role`, so callers never write a country's code. */
export function glCodeForRole(pack: RegionPack, role: GlAccountRole, index = 0): string {
  const account = glAccountsByRole(pack, role)[index];
  if (account === undefined) {
    throw new Error(`region pack ${pack.code} has no account #${String(index)} with role ${role}`);
  }
  return account.code;
}

/** The GL code money of `kind` posts to (I5). */
export function glCodeForCash(pack: RegionPack, kind: AccountKind): string {
  const account = cashGlAccountFor(pack, kind);
  if (account === undefined) {
    throw new Error(`region pack ${pack.code} has no cash account for kind ${kind}`);
  }
  return account.code;
}

/** The first currency businesses here transact in besides the local one. */
export function foreignCurrency(pack: RegionPack): string {
  const currency = pack.currency.common[0];
  if (currency === undefined) {
    throw new Error(`region pack ${pack.code} declares no foreign currency`);
  }
  return currency;
}
