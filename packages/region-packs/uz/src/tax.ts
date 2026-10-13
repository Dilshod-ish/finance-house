import { isoDate } from '@fincore/shared';
import type { TaxRateVersion, TaxRegime } from '@fincore/region-pack-contract';

/**
 * 2026 rates, as data. Every version carries `effectiveFrom`/`effectiveTo`
 * because the law changes each January and last year's report must keep last
 * year's rates (architecture §4.1).
 *
 * Only rates that can be verified from the domain documents are listed here.
 * The `it_park` regime is deliberately absent: its relief is described as
 * "configurable" with no numbers, and inventing them would be worse than not
 * offering the regime.
 */
const FROM_2026 = isoDate('2026-01-01');

/** Applies to every regime: payroll withholding and the social contribution. */
const PAYROLL_RATES: readonly TaxRateVersion[] = [
  {
    kind: 'personal_income',
    ratePercent: '12',
    baseKey: 'taxBase.grossSalary',
    effectiveFrom: FROM_2026,
    effectiveTo: null,
  },
  {
    kind: 'social',
    ratePercent: '12',
    baseKey: 'taxBase.payrollFund',
    effectiveFrom: FROM_2026,
    effectiveTo: null,
  },
];

export const TAX_REGIMES: readonly TaxRegime[] = [
  {
    code: 'aylanma_1',
    nameKey: 'taxRegime.aylanma1',
    descriptionKey: 'taxRegime.aylanma1.description',
    legalForms: ['YaTT'],
    rates: [
      {
        kind: 'turnover',
        ratePercent: '1',
        baseKey: 'taxBase.turnover',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
      ...PAYROLL_RATES,
    ],
    turnoverCeilings: [
      {
        amount: '1000000000.0000',
        currency: 'UZS',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
    ],
  },
  {
    code: 'aylanma_4',
    nameKey: 'taxRegime.aylanma4',
    descriptionKey: 'taxRegime.aylanma4.description',
    legalForms: ['MCHJ', 'XK'],
    rates: [
      {
        kind: 'turnover',
        ratePercent: '4',
        baseKey: 'taxBase.turnover',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
      ...PAYROLL_RATES,
    ],
    turnoverCeilings: [
      {
        amount: '1000000000.0000',
        currency: 'UZS',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
    ],
  },
  {
    code: 'qqs_foyda',
    nameKey: 'taxRegime.qqsFoyda',
    descriptionKey: 'taxRegime.qqsFoyda.description',
    legalForms: ['MCHJ', 'XK', 'YaTT'],
    rates: [
      {
        kind: 'vat',
        ratePercent: '12',
        baseKey: 'taxBase.addedValue',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
      {
        kind: 'profit',
        ratePercent: '15',
        baseKey: 'taxBase.taxableProfit',
        effectiveFrom: FROM_2026,
        effectiveTo: null,
      },
      ...PAYROLL_RATES,
    ],
    turnoverCeilings: [],
  },
];
