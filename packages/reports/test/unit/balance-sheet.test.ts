import { describe, expect, it } from 'vitest';
import { GL_ACCOUNT_ROLES, Money, ROLE_ACCOUNT_TYPE, currency, isoDate } from '@fincore/shared';
import type { GlAccountRole } from '@fincore/shared';
import {
  BALANCE_SHEET,
  RESULT_EXPENSE_ROLES,
  RESULT_INCOME_ROLES,
  buildBalanceSheet,
  rolesForBalanceSheetLine,
  type BalanceSheetLineSpec,
  type RoleBalances,
} from '../../src/index.js';

const UZS = currency('UZS');
const AS_OF = isoDate('2026-03-31');

function balances(entries: Partial<Record<GlAccountRole, string>>): RoleBalances {
  return new Map(
    Object.entries(entries).map(([role, amount]) => [role as GlAccountRole, Money.of(amount, UZS)]),
  );
}

const build = (b: RoleBalances, structure?: readonly BalanceSheetLineSpec[]) =>
  buildBalanceSheet(b, { asOf: AS_OF, currency: UZS }, structure);

function amountOf(report: ReturnType<typeof build>, code: string): string {
  const line = report.lines.find((l) => l.code === code);
  if (line === undefined) {
    throw new Error(`no line ${code}`);
  }
  return line.amount.toStorage();
}

describe('balance sheet structure', () => {
  it('claims every account role exactly once', () => {
    const claimed = new Map<GlAccountRole, string[]>();
    for (const spec of BALANCE_SHEET) {
      for (const role of spec.roles) {
        claimed.set(role, [...(claimed.get(role) ?? []), spec.code]);
      }
    }
    for (const role of [...RESULT_INCOME_ROLES, ...RESULT_EXPENSE_ROLES]) {
      claimed.set(role, [...(claimed.get(role) ?? []), 'equity.result']);
    }

    // A role no line claims would drop money off the sheet silently; a role two
    // lines claim would count it twice.
    for (const role of GL_ACCOUNT_ROLES) {
      expect([role, claimed.get(role) ?? []]).toEqual([role, [expect.any(String)]]);
    }
  });

  it('puts the income and expense roles on the result line, nowhere else', () => {
    const resultRoles = new Set<GlAccountRole>([...RESULT_INCOME_ROLES, ...RESULT_EXPENSE_ROLES]);
    for (const role of resultRoles) {
      expect([role, ['income', 'expense'].includes(ROLE_ACCOUNT_TYPE[role])]).toEqual([role, true]);
    }
    for (const spec of BALANCE_SHEET) {
      for (const role of spec.roles) {
        expect([spec.code, role, resultRoles.has(role)]).toEqual([spec.code, role, false]);
      }
    }
  });

  it('references only lines that exist, with unique codes', () => {
    const codes = new Set(BALANCE_SHEET.map((s) => s.code));
    expect(codes.size).toBe(BALANCE_SHEET.length);
    for (const spec of BALANCE_SHEET) {
      for (const component of spec.components) {
        expect([spec.code, component, codes.has(component)]).toEqual([spec.code, component, true]);
      }
    }
  });

  it('keeps every line on a side and gives the two sections level 0', () => {
    const sections = BALANCE_SHEET.filter((s) => s.level === 0);
    expect(sections.map((s) => s.code)).toEqual(['assets', 'liabilitiesAndEquity']);
    for (const spec of BALANCE_SHEET) {
      expect(['assets', 'liabilities_and_equity']).toContain(spec.side);
    }
  });
});

describe('buildBalanceSheet', () => {
  it('balances a sheet funded entirely by share capital', () => {
    const report = build(balances({ cash: '1000', share_capital: '1000' }));
    expect(report.totalAssets.toStorage()).toBe('1000.0000');
    expect(report.totalEquity.toStorage()).toBe('1000.0000');
    expect(report.totalLiabilities.toStorage()).toBe('0.0000');
    expect(report.difference.toStorage()).toBe('0.0000');
    expect(report.isBalanced).toBe(true);
    expect(report.asOf).toBe(AS_OF);
    expect(report.currency).toBe(UZS);
  });

  it('carries the period result into equity without a closing entry', () => {
    const report = build(balances({ cash: '500', revenue: '600', expense: '100' }));
    expect(amountOf(report, 'equity.result')).toBe('500.0000');
    expect(report.totalEquity.toStorage()).toBe('500.0000');
    expect(report.isBalanced).toBe(true);
  });

  it('nets accumulated depreciation against fixed assets on one line', () => {
    const report = build(balances({ fixed_asset: '900', accumulated_depreciation: '-250' }));
    expect(amountOf(report, 'assets.noncurrent.fixedAssets')).toBe('650.0000');
    expect(report.totalAssets.toStorage()).toBe('650.0000');
  });

  it('lets owner draws reduce equity', () => {
    const report = build(balances({ share_capital: '1000', owner_draw: '-300' }));
    expect(amountOf(report, 'equity.ownerDraw')).toBe('-300.0000');
    expect(report.totalEquity.toStorage()).toBe('700.0000');
  });

  it('merges the roles a single line claims', () => {
    const report = build(balances({ cash: '100', money_in_transit: '25' }));
    expect(amountOf(report, 'assets.current.cash')).toBe('125.0000');

    const taxes = build(balances({ tax_payable: '40', output_vat: '60' }));
    expect(amountOf(taxes, 'liabilities.current.taxes')).toBe('100.0000');
  });

  it('treats an absent role as zero rather than failing', () => {
    const report = build(balances({}));
    expect(amountOf(report, 'assets.current.inventory')).toBe('0.0000');
    expect(report.isBalanced).toBe(true);
  });

  it('reports a non-zero difference instead of hiding it', () => {
    // Only reachable with role balances the ledger could not produce; the point
    // is that the report surfaces the break rather than plugging it.
    const report = build(balances({ cash: '1000', share_capital: '900' }));
    expect(report.difference.toStorage()).toBe('100.0000');
    expect(report.isBalanced).toBe(false);
  });

  it('marks subtotals and keeps leaf lines unmarked', () => {
    const report = build(balances({ cash: '1' }));
    const totals = report.lines.filter((l) => l.isTotal).map((l) => l.code);
    expect(totals).toContain('assets');
    expect(totals).toContain('equity');
    expect(totals).not.toContain('assets.current.cash');
  });

  it('resolves subtotals regardless of declaration order', () => {
    // Components declared before their parent — the opposite of BALANCE_SHEET.
    const structure: BalanceSheetLineSpec[] = [
      {
        code: 'leaf',
        labelKey: 'x',
        side: 'assets',
        level: 2,
        kind: 'roles',
        roles: ['cash'],
        components: [],
      },
      {
        code: 'assets',
        labelKey: 'x',
        side: 'assets',
        level: 0,
        kind: 'subtotal',
        roles: [],
        components: ['leaf'],
      },
      {
        code: 'liabilitiesAndEquity',
        labelKey: 'x',
        side: 'liabilities_and_equity',
        level: 0,
        kind: 'subtotal',
        roles: [],
        components: ['liabilities', 'equity'],
      },
      {
        code: 'liabilities',
        labelKey: 'x',
        side: 'liabilities_and_equity',
        level: 1,
        kind: 'subtotal',
        roles: [],
        components: [],
      },
      {
        code: 'equity',
        labelKey: 'x',
        side: 'liabilities_and_equity',
        level: 1,
        kind: 'subtotal',
        roles: [],
        components: [],
      },
    ];
    const report = build(balances({ cash: '7' }), structure);
    expect(report.totalAssets.toStorage()).toBe('7.0000');
  });

  it('fails loudly on a structure that references a missing line', () => {
    const structure: BalanceSheetLineSpec[] = [
      {
        code: 'assets',
        labelKey: 'x',
        side: 'assets',
        level: 0,
        kind: 'subtotal',
        roles: [],
        components: ['nope'],
      },
    ];
    expect(() => build(balances({}), structure)).toThrow(/unknown line: nope/);
  });

  it('fails loudly on a cycle instead of looping forever', () => {
    const structure: BalanceSheetLineSpec[] = [
      {
        code: 'assets',
        labelKey: 'x',
        side: 'assets',
        level: 0,
        kind: 'subtotal',
        roles: [],
        components: ['loop'],
      },
      {
        code: 'loop',
        labelKey: 'x',
        side: 'assets',
        level: 1,
        kind: 'subtotal',
        roles: [],
        components: ['assets'],
      },
    ];
    expect(() => build(balances({}), structure)).toThrow(/cycle at: assets/);
  });
});

describe('rolesForBalanceSheetLine', () => {
  it('gives a detail line exactly the roles it claims', () => {
    expect([...rolesForBalanceSheetLine('assets.current.cash')].sort()).toEqual(
      [...(BALANCE_SHEET.find((s) => s.code === 'assets.current.cash')?.roles ?? [])].sort(),
    );
  });

  it('unions the roles of a subtotal through its components', () => {
    const assets = [...rolesForBalanceSheetLine('assets')].sort();
    const claimed = BALANCE_SHEET.filter((s) => s.side === 'assets' && s.kind === 'roles').flatMap(
      (s) => s.roles,
    );
    expect(assets).toEqual([...new Set(claimed)].sort());
  });

  it('expands the period result into every income and expense role it derives from', () => {
    const result = BALANCE_SHEET.find((s) => s.kind === 'period_result');
    if (result === undefined) throw new Error('no period_result line');
    expect([...rolesForBalanceSheetLine(result.code)].sort()).toEqual(
      [...new Set([...RESULT_INCOME_ROLES, ...RESULT_EXPENSE_ROLES])].sort(),
    );
  });

  it('refuses a code that is not a line, rather than returning nothing', () => {
    expect(() => rolesForBalanceSheetLine('nope')).toThrow(/Not a balance-sheet line: nope/);
  });
});
