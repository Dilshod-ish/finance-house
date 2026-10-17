import { isoDate, type IsoDate } from '@fincore/shared';

/**
 * Three businesses, six months, one platform.
 *
 * **This data is synthetic.** Transaction-level books of a privately held
 * company with ~$1m of revenue are not published anywhere, in any
 * jurisdiction — small firms do not file them. What *is* public is the shape
 * of such a business: margin bands, payment terms, the mix of costs. So the
 * figures below are generated to reproduce published ranges rather than copied
 * from any real company's ledger, and nothing here should be read as one.
 *
 * Sources for the ranges, all secondary and directional:
 *
 * - Professional / business services gross margin 50–80%, operating 15–30%:
 *   cleverence.com small-business margin guides (2026).
 * - Brick-and-mortar retail gross 25–40%, operating 5–12%, net 2–8%: same
 *   source; beancount.io's benchmarking note gives 25–50% gross for retail.
 * - Light/discrete manufacturing gross 25–45%, operating 6–14%, net 5–10%:
 *   same source; beancount.io narrows manufacturing to 25–35%.
 * - Cross-industry average gross margin ≈ 36%: beancount.io.
 *
 * The exchange rates in `fx.ts` are anchored to published Central Bank of
 * Uzbekistan and EUR/USD figures for the same months; see that file.
 */

export const SHOWCASE_WINDOW = {
  from: isoDate('2026-01-01'),
  to: isoDate('2026-06-30'),
} as const;

export type Sector = 'b2b' | 'b2c' | 'manufacturing';

export interface ShowcaseProfile {
  readonly key: Sector;
  readonly orgId: string;
  readonly legalEntityId: string;
  readonly name: string;
  /** The bare trading name; the legal form is appended from the region pack. */
  readonly tradeName: string;
  /** One line a reader can hold in their head. */
  readonly summaryKey: string;
  /** Every figure in every report is stated in this currency. */
  readonly functionalCurrency: 'USD';
  readonly directions: readonly string[];
  readonly counterparties: readonly string[];
  /** Deterministic PRNG seed — the same data on every run. */
  readonly rngSeed: number;
  /**
   * The business, as monthly ranges. Everything is read from here rather than
   * written into the generator, so the calibration is reviewable in one place
   * and a sector can be re-tuned without touching the posting code.
   *
   * Every organization reports in USD while most of what it spends is som, so
   * the som figures are sized against USD revenue — roughly 12 000 UZS to the
   * dollar over this window.
   */
  readonly monthly: {
    /** Sales invoices or till takings, as the sector dictates. */
    readonly revenue: {
      readonly count: number;
      readonly termDays: number;
      readonly invoiceUsd: readonly [number, number];
      readonly invoiceEur: readonly [number, number];
      readonly invoiceUzs: readonly [number, number];
    };
    readonly cogsCount: number;
    readonly cogsUzs: readonly [number, number];
    readonly cogsUsd: readonly [number, number];
    readonly payrollUzs: readonly [number, number];
    readonly rentUzs: readonly [number, number];
    readonly utilitiesUzs: readonly [number, number];
    readonly communicationsUzs: readonly [number, number];
    readonly marketingUzs: readonly [number, number];
    readonly softwareUsd: readonly [number, number];
    readonly taxUzs: readonly [number, number];
  };
  /** Cash and bank balances on the opening date, by currency. */
  readonly opening: {
    readonly bankUsd: number;
    readonly bankUzs: number;
    readonly bankEur: number;
    readonly cashUsd: number;
    readonly cashUzs: number;
    readonly cashEur: number;
    readonly shareCapitalUsd: number;
  };
}

/** Whole units, converted to minor units by the generator. */
export const SHOWCASE_PROFILES: readonly ShowcaseProfile[] = [
  {
    key: 'b2b',
    orgId: '7c1d3a90-0000-4000-8000-00000000b2b1',
    legalEntityId: '7c1d3a90-0000-4000-8000-00000000e2b1',
    name: 'Silk Road Systems',
    tradeName: 'Silk Road Systems',
    summaryKey: 'showcase.b2b.summary',
    functionalCurrency: 'USD',
    directions: ['Integration projects', 'Support retainers', 'Licences'],
    counterparties: [
      'Aurora Freight BV',
      'Nordwind Logistik GmbH',
      'Meridian Bank',
      'Citygate Retail Park',
      'Helix Data Ltd',
      'Granite Peak Mining',
      'Orient Telecom Group',
      'Devs Outsourcing LLP',
    ],
    rngSeed: 20260101,
    // Target: ~$520k revenue over six months, 55% gross, EBITDA in the
    // 15–30% band published for professional services.
    monthly: {
      revenue: {
        count: 8,
        termDays: 35,
        invoiceUsd: [7_000, 16_000],
        invoiceEur: [5_000, 11_000],
        invoiceUzs: [70_000_000, 150_000_000],
      },
      cogsCount: 4,
      cogsUzs: [78_000_000, 132_000_000],
      cogsUsd: [3_000, 7_000],
      payrollUzs: [230_000_000, 270_000_000],
      rentUzs: [33_000_000, 41_000_000],
      utilitiesUzs: [6_000_000, 9_000_000],
      communicationsUzs: [4_000_000, 6_500_000],
      marketingUzs: [14_000_000, 24_000_000],
      softwareUsd: [900, 1_500],
      taxUzs: [38_000_000, 62_000_000],
    },
    opening: {
      bankUsd: 84_000,
      bankUzs: 180_000_000,
      bankEur: 12_000,
      cashUsd: 2_500,
      cashUzs: 14_000_000,
      cashEur: 800,
      shareCapitalUsd: 60_000,
    },
  },
  {
    key: 'b2c',
    orgId: '7c1d3a90-0000-4000-8000-00000000b2c2',
    legalEntityId: '7c1d3a90-0000-4000-8000-00000000e2c2',
    name: 'Marketa',
    tradeName: 'Bozor Market',
    summaryKey: 'showcase.b2c.summary',
    functionalCurrency: 'USD',
    directions: ['Store 1 — North', 'Store 2 — Riverside', 'Online'],
    counterparties: [
      'Oltin Vodiy Distribution',
      'Fresh Foods Import',
      'Skyline Catering',
      'Westgate Property',
      'Regional Utilities',
      'Cardlink Acquiring',
      'Sello Wholesale',
      'Meridian Bank',
    ],
    rngSeed: 20260202,
    // Target: ~$530k revenue, 32% gross and 5–12% operating — the band
    // published for brick-and-mortar retail.
    monthly: {
      revenue: {
        count: 0,
        termDays: 0,
        invoiceUsd: [0, 0],
        invoiceEur: [0, 0],
        invoiceUzs: [0, 0],
      },
      cogsCount: 6,
      cogsUzs: [110_000_000, 158_000_000],
      cogsUsd: [0, 0],
      payrollUzs: [122_000_000, 146_000_000],
      rentUzs: [44_000_000, 54_000_000],
      utilitiesUzs: [8_000_000, 13_000_000],
      communicationsUzs: [3_000_000, 5_000_000],
      marketingUzs: [19_000_000, 29_000_000],
      softwareUsd: [250, 600],
      taxUzs: [30_000_000, 52_000_000],
    },
    opening: {
      bankUsd: 9_000,
      bankUzs: 240_000_000,
      bankEur: 1_500,
      cashUsd: 4_200,
      cashUzs: 62_000_000,
      cashEur: 1_100,
      shareCapitalUsd: 40_000,
    },
  },
  {
    key: 'manufacturing',
    orgId: '7c1d3a90-0000-4000-8000-00000000a3f3',
    legalEntityId: '7c1d3a90-0000-4000-8000-00000000e3f3',
    name: 'Terra Textiles',
    tradeName: 'Toshkent Tekstil',
    summaryKey: 'showcase.mfg.summary',
    functionalCurrency: 'USD',
    directions: ['Export — knitwear', 'Export — home textile', 'Domestic'],
    counterparties: [
      'Baltic Apparel OY',
      'Milano Tessuti SRL',
      'Delta Cotton Supply',
      'Dyestuff Import Co',
      'Highland Energy',
      'Tekstil Mashina AG',
      'Continental Bank',
      'Samarqand Trade House',
    ],
    rngSeed: 20260303,
    // Target: ~$500k revenue, 28–30% gross and 6–14% operating — the band
    // published for light manufacturing. Factory utilities run high.
    monthly: {
      revenue: {
        count: 6,
        termDays: 50,
        invoiceUsd: [9_000, 21_000],
        invoiceEur: [7_000, 14_000],
        invoiceUzs: [95_000_000, 195_000_000],
      },
      cogsCount: 5,
      cogsUzs: [118_000_000, 178_000_000],
      cogsUsd: [5_000, 11_000],
      payrollUzs: [98_000_000, 124_000_000],
      rentUzs: [22_000_000, 28_000_000],
      utilitiesUzs: [32_000_000, 44_000_000],
      communicationsUzs: [3_500_000, 5_500_000],
      marketingUzs: [8_000_000, 13_000_000],
      softwareUsd: [300, 700],
      taxUzs: [22_000_000, 40_000_000],
    },
    opening: {
      bankUsd: 56_000,
      bankUzs: 310_000_000,
      bankEur: 23_000,
      cashUsd: 1_800,
      cashUzs: 21_000_000,
      cashEur: 400,
      shareCapitalUsd: 90_000,
    },
  },
];

export const SHOWCASE_OWNER_USER_ID = '7c1d3a90-0000-4000-8000-0000000000a1';

export function profileFor(key: Sector): ShowcaseProfile {
  const profile = SHOWCASE_PROFILES.find((candidate) => candidate.key === key);
  if (profile === undefined) {
    throw new Error(`no showcase profile ${key}`);
  }
  return profile;
}

export type { IsoDate };
