import type { GlAccountSeed } from '@fincore/region-pack-contract';

/**
 * Internal management chart of accounts (architecture §2.3) — deliberately not
 * the statutory NSBU/BHMS plan. The user never sees these codes; they see
 * articles. Classes: 1 assets, 2 liabilities, 3 equity, 4 income, 5 expenses.
 *
 * Every account carries a `role`. That is what lets a report place it on a
 * balance-sheet or P&L line without naming a country's codes, and it is why no
 * account may be left unroled: an unroled account falls out of every report
 * silently.
 */
export const CHART_OF_ACCOUNTS: readonly GlAccountSeed[] = [
  // 1xxx — assets
  {
    code: '1010',
    nameKey: 'gl.1010',
    type: 'asset',
    normalSide: 'D',
    role: 'cash',
    accountKind: 'bank',
  },
  {
    code: '1020',
    nameKey: 'gl.1020',
    type: 'asset',
    normalSide: 'D',
    role: 'cash',
    accountKind: 'cash',
  },
  {
    code: '1030',
    nameKey: 'gl.1030',
    type: 'asset',
    normalSide: 'D',
    role: 'cash',
    accountKind: 'card',
  },
  {
    code: '1040',
    nameKey: 'gl.1040',
    type: 'asset',
    normalSide: 'D',
    role: 'cash',
    accountKind: 'ewallet',
  },
  {
    code: '1090',
    nameKey: 'gl.1090',
    type: 'asset',
    normalSide: 'D',
    role: 'money_in_transit',
    accountKind: null,
  },
  {
    code: '1200',
    nameKey: 'gl.1200',
    type: 'asset',
    normalSide: 'D',
    role: 'receivable',
    accountKind: null,
  },
  {
    code: '1210',
    nameKey: 'gl.1210',
    type: 'asset',
    normalSide: 'D',
    role: 'prepaid',
    accountKind: null,
  },
  {
    code: '1300',
    nameKey: 'gl.1300',
    type: 'asset',
    normalSide: 'D',
    role: 'inventory',
    accountKind: null,
  },
  {
    code: '1400',
    nameKey: 'gl.1400',
    type: 'asset',
    normalSide: 'D',
    role: 'input_vat',
    accountKind: null,
  },
  {
    code: '1500',
    nameKey: 'gl.1500',
    type: 'asset',
    normalSide: 'D',
    role: 'fixed_asset',
    accountKind: null,
  },
  // Clearing account for imported cash that nobody has classified yet. It is
  // listed with the assets because that is where it is presented; its balance
  // runs either way and must be zero before a period closes.
  {
    code: '1900',
    nameKey: 'gl.1900',
    type: 'asset',
    normalSide: 'D',
    role: 'suspense',
    accountKind: null,
  },

  // Contra-asset: a credit balance that reduces fixed assets.
  {
    code: '1510',
    nameKey: 'gl.1510',
    type: 'asset',
    normalSide: 'C',
    role: 'accumulated_depreciation',
    accountKind: null,
  },

  // 2xxx — liabilities
  {
    code: '2010',
    nameKey: 'gl.2010',
    type: 'liability',
    normalSide: 'C',
    role: 'payable',
    accountKind: null,
  },
  {
    code: '2020',
    nameKey: 'gl.2020',
    type: 'liability',
    normalSide: 'C',
    role: 'advance_received',
    accountKind: null,
  },
  {
    code: '2100',
    nameKey: 'gl.2100',
    type: 'liability',
    normalSide: 'C',
    role: 'payroll_payable',
    accountKind: null,
  },
  {
    code: '2200',
    nameKey: 'gl.2200',
    type: 'liability',
    normalSide: 'C',
    role: 'loan',
    accountKind: null,
  },
  {
    code: '2210',
    nameKey: 'gl.2210',
    type: 'liability',
    normalSide: 'C',
    role: 'accrued_interest',
    accountKind: null,
  },
  {
    code: '2300',
    nameKey: 'gl.2300',
    type: 'liability',
    normalSide: 'C',
    role: 'output_vat',
    accountKind: null,
  },
  {
    code: '2400',
    nameKey: 'gl.2400',
    type: 'liability',
    normalSide: 'C',
    role: 'tax_payable',
    accountKind: null,
  },

  // 3xxx — equity
  {
    code: '3010',
    nameKey: 'gl.3010',
    type: 'equity',
    normalSide: 'C',
    role: 'share_capital',
    accountKind: null,
  },
  {
    code: '3020',
    nameKey: 'gl.3020',
    type: 'equity',
    normalSide: 'C',
    role: 'retained_earnings',
    accountKind: null,
  },
  // Contra-equity: dividends and owner withdrawals reduce equity.
  {
    code: '3030',
    nameKey: 'gl.3030',
    type: 'equity',
    normalSide: 'D',
    role: 'owner_draw',
    accountKind: null,
  },

  // 4xxx — income
  {
    code: '4010',
    nameKey: 'gl.4010',
    type: 'income',
    normalSide: 'C',
    role: 'revenue',
    accountKind: null,
  },
  {
    code: '4020',
    nameKey: 'gl.4020',
    type: 'income',
    normalSide: 'C',
    role: 'revenue',
    accountKind: null,
  },
  {
    code: '4900',
    nameKey: 'gl.4900',
    type: 'income',
    normalSide: 'C',
    role: 'other_income',
    accountKind: null,
  },

  // 5xxx — expenses
  {
    code: '5010',
    nameKey: 'gl.5010',
    type: 'expense',
    normalSide: 'D',
    role: 'cost_of_sales',
    accountKind: null,
  },
  {
    code: '5100',
    nameKey: 'gl.5100',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5110',
    nameKey: 'gl.5110',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5200',
    nameKey: 'gl.5200',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5300',
    nameKey: 'gl.5300',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5400',
    nameKey: 'gl.5400',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5500',
    nameKey: 'gl.5500',
    type: 'expense',
    normalSide: 'D',
    role: 'expense',
    accountKind: null,
  },
  {
    code: '5600',
    nameKey: 'gl.5600',
    type: 'expense',
    normalSide: 'D',
    role: 'depreciation',
    accountKind: null,
  },
  {
    code: '5700',
    nameKey: 'gl.5700',
    type: 'expense',
    normalSide: 'D',
    role: 'interest_expense',
    accountKind: null,
  },
  // 5800 and 5900 were one account; the P&L has separate lines for taxes and
  // FX differences (architecture §7.2), so one account could not serve both.
  {
    code: '5800',
    nameKey: 'gl.5800',
    type: 'expense',
    normalSide: 'D',
    role: 'tax_expense',
    accountKind: null,
  },
  {
    code: '5900',
    nameKey: 'gl.5900',
    type: 'expense',
    normalSide: 'D',
    role: 'fx_difference',
    accountKind: null,
  },
];
