import type { IsoDate } from '@fincore/shared';

/**
 * Everything a pack declares is versioned by date: tax law changes every
 * January, and last year's report must keep last year's rates (architecture
 * §4.1). Rates are never hardcoded in application code.
 */
export interface EffectiveDated {
  readonly effectiveFrom: IsoDate;
  /** Inclusive last day the version applies; null means still in force. */
  readonly effectiveTo: IsoDate | null;
}

export type TaxKind = 'turnover' | 'vat' | 'profit' | 'social' | 'personal_income' | 'property';

export interface TaxRateVersion extends EffectiveDated {
  readonly kind: TaxKind;
  /** Percent as an exact decimal string — never a float (I7 in spirit). */
  readonly ratePercent: string;
  /** Locale key describing the base the rate applies to. */
  readonly baseKey: string;
}

export interface TurnoverCeiling extends EffectiveDated {
  /** Annual turnover above which the regime may no longer be used. */
  readonly amount: string;
  readonly currency: string;
}

export interface TaxRegime {
  readonly code: string;
  readonly nameKey: string;
  readonly descriptionKey: string;
  /** Legal form codes that may elect this regime. */
  readonly legalForms: readonly string[];
  readonly rates: readonly TaxRateVersion[];
  /** Present when eligibility depends on turnover (the "1 bln radar"). */
  readonly turnoverCeilings: readonly TurnoverCeiling[];
}

function coversDate(period: EffectiveDated, on: IsoDate): boolean {
  if (on < period.effectiveFrom) {
    return false;
  }
  return period.effectiveTo === null || on <= period.effectiveTo;
}

/** The rate versions in force on `on`. Pure; the caller supplies the date. */
export function ratesEffectiveOn(regime: TaxRegime, on: IsoDate): readonly TaxRateVersion[] {
  return regime.rates.filter((rate) => coversDate(rate, on));
}

/** The single rate of `kind` in force on `on`, or undefined. */
export function rateEffectiveOn(
  regime: TaxRegime,
  kind: TaxKind,
  on: IsoDate,
): TaxRateVersion | undefined {
  return ratesEffectiveOn(regime, on).find((rate) => rate.kind === kind);
}

export function turnoverCeilingEffectiveOn(
  regime: TaxRegime,
  on: IsoDate,
): TurnoverCeiling | undefined {
  return regime.turnoverCeilings.find((ceiling) => coversDate(ceiling, on));
}
