import type { GlAccountSeed } from '@fincore/region-pack-contract';

/**
 * Internal management chart of accounts (architecture §2.3) — deliberately not
 * the statutory NSBU/BHMS plan. The user never sees these codes; they see
 * articles. Classes: 1 assets, 2 liabilities, 3 equity, 4 income, 5 expenses.
 */
export const CHART_OF_ACCOUNTS: readonly GlAccountSeed[] = [
  // 1xxx — assets
  { code: '1010', nameKey: 'gl.1010', type: 'asset', normalSide: 'D' },
  { code: '1020', nameKey: 'gl.1020', type: 'asset', normalSide: 'D' },
  { code: '1030', nameKey: 'gl.1030', type: 'asset', normalSide: 'D' },
  { code: '1040', nameKey: 'gl.1040', type: 'asset', normalSide: 'D' },
  { code: '1090', nameKey: 'gl.1090', type: 'asset', normalSide: 'D' },
  { code: '1200', nameKey: 'gl.1200', type: 'asset', normalSide: 'D' },
  { code: '1210', nameKey: 'gl.1210', type: 'asset', normalSide: 'D' },
  { code: '1300', nameKey: 'gl.1300', type: 'asset', normalSide: 'D' },
  { code: '1400', nameKey: 'gl.1400', type: 'asset', normalSide: 'D' },
  { code: '1500', nameKey: 'gl.1500', type: 'asset', normalSide: 'D' },
  { code: '1510', nameKey: 'gl.1510', type: 'asset', normalSide: 'C' },

  // 2xxx — liabilities
  { code: '2010', nameKey: 'gl.2010', type: 'liability', normalSide: 'C' },
  { code: '2020', nameKey: 'gl.2020', type: 'liability', normalSide: 'C' },
  { code: '2100', nameKey: 'gl.2100', type: 'liability', normalSide: 'C' },
  { code: '2200', nameKey: 'gl.2200', type: 'liability', normalSide: 'C' },
  { code: '2210', nameKey: 'gl.2210', type: 'liability', normalSide: 'C' },
  { code: '2300', nameKey: 'gl.2300', type: 'liability', normalSide: 'C' },
  { code: '2400', nameKey: 'gl.2400', type: 'liability', normalSide: 'C' },

  // 3xxx — equity
  { code: '3010', nameKey: 'gl.3010', type: 'equity', normalSide: 'C' },
  { code: '3020', nameKey: 'gl.3020', type: 'equity', normalSide: 'C' },
  { code: '3030', nameKey: 'gl.3030', type: 'equity', normalSide: 'D' },

  // 4xxx — income
  { code: '4010', nameKey: 'gl.4010', type: 'income', normalSide: 'C' },
  { code: '4020', nameKey: 'gl.4020', type: 'income', normalSide: 'C' },
  { code: '4900', nameKey: 'gl.4900', type: 'income', normalSide: 'C' },

  // 5xxx — expenses
  { code: '5010', nameKey: 'gl.5010', type: 'expense', normalSide: 'D' },
  { code: '5100', nameKey: 'gl.5100', type: 'expense', normalSide: 'D' },
  { code: '5110', nameKey: 'gl.5110', type: 'expense', normalSide: 'D' },
  { code: '5200', nameKey: 'gl.5200', type: 'expense', normalSide: 'D' },
  { code: '5300', nameKey: 'gl.5300', type: 'expense', normalSide: 'D' },
  { code: '5400', nameKey: 'gl.5400', type: 'expense', normalSide: 'D' },
  { code: '5500', nameKey: 'gl.5500', type: 'expense', normalSide: 'D' },
  { code: '5600', nameKey: 'gl.5600', type: 'expense', normalSide: 'D' },
  { code: '5700', nameKey: 'gl.5700', type: 'expense', normalSide: 'D' },
  { code: '5900', nameKey: 'gl.5900', type: 'expense', normalSide: 'D' },
];
