import { describe, expect, it } from 'vitest';
import { GL_ACCOUNT_ROLES, Money, currency, isoDate, monthKey } from '@fincore/shared';
import type { MonthKey } from '@fincore/shared';
import {
  CASH_FLOW,
  CLOSING_CASH_CODE,
  NON_CASH_CODE,
  OPENING_CASH_CODE,
  SECTION_BY_CONTRA_ROLE,
  buildCashFlow,
  contraRolesForCashFlowLine,
  periodsBetween,
  rolesForSection,
  type CashFlowFact,
  type CashFlowLineSpec,
  type CashFlowReport,
  type CashPosition,
} from '../../src/index.js';

const UZS = currency('UZS');
const FROM = isoDate('2026-01-01');
const TO = isoDate('2026-03-31');
const zero = Money.zero(UZS);

function fact(
  section: CashFlowFact['section'],
  direction: CashFlowFact['direction'],
  amount: string,
  over: Partial<CashFlowFact> = {},
): CashFlowFact {
  return {
    period: monthKey(FROM),
    section,
    direction,
    articleId: null,
    articleName: null,
    directionId: null,
    directionName: null,
    counterpartyId: null,
    counterpartyName: null,
    accountId: 'ac0',
    accountName: 'Account',
    amount: Money.of(amount, UZS),
    ...over,
  };
}

const position = (over: Partial<CashPosition> = {}): CashPosition => ({
  openingCash: zero,
  closingCash: zero,
  nonCashByPeriod: new Map(),
  ...over,
});

const build = (
  facts: readonly CashFlowFact[],
  over: Partial<Parameters<typeof buildCashFlow>[1]> = {},
  structure?: readonly CashFlowLineSpec[],
): CashFlowReport =>
  buildCashFlow(
    facts,
    { from: FROM, to: TO, currency: UZS, grouping: 'none', position: position(), ...over },
    structure,
  );

const row = (report: CashFlowReport, code: string) => {
  const found = report.rows.find((candidate) => candidate.code === code);
  if (found === undefined) {
    throw new Error(`no row ${code}`);
  }
  return found;
};

describe('periodsBetween', () => {
  it('covers every month the range touches, whole or partial', () => {
    expect(periodsBetween(FROM, TO)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(periodsBetween(isoDate('2026-01-15'), isoDate('2026-02-03'))).toEqual([
      '2026-01',
      '2026-02',
    ]);
  });

  it('returns a single column for a range inside one month', () => {
    expect(periodsBetween(isoDate('2026-02-05'), isoDate('2026-02-06'))).toEqual(['2026-02']);
  });

  it('crosses a year boundary', () => {
    expect(periodsBetween(isoDate('2025-12-01'), isoDate('2026-01-31'))).toEqual([
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('SECTION_BY_CONTRA_ROLE', () => {
  it('maps every account role, so no cash movement can be unclassified', () => {
    expect(Object.keys(SECTION_BY_CONTRA_ROLE).sort()).toEqual([...GL_ACCOUNT_ROLES].sort());
  });

  it('treats a move to another own account as a transfer, not a flow', () => {
    expect(SECTION_BY_CONTRA_ROLE.cash).toBe('transfer');
    expect(SECTION_BY_CONTRA_ROLE.money_in_transit).toBe('transfer');
  });

  it('puts the capital structure in financing and the asset base in investing', () => {
    expect([...rolesForSection('financing')].sort()).toEqual(
      ['loan', 'owner_draw', 'retained_earnings', 'share_capital'].sort(),
    );
    expect([...rolesForSection('investing')].sort()).toEqual(
      ['accumulated_depreciation', 'fixed_asset'].sort(),
    );
  });
});

describe('buildCashFlow', () => {
  it('sums a flow into its section and direction', () => {
    const report = build([fact('operating', 'in', '100'), fact('operating', 'out', '40')]);
    expect(row(report, 'operating.in').total.toStorage()).toBe('100.0000');
    expect(row(report, 'operating.out').total.toStorage()).toBe('40.0000');
    expect(row(report, 'operating').total.toStorage()).toBe('60.0000');
  });

  it('places a fact in the month it belongs to', () => {
    const report = build([
      fact('operating', 'in', '10'),
      fact('operating', 'in', '20', { period: '2026-03' as MonthKey }),
    ]);
    expect(row(report, 'operating.in').amounts.map((a) => a.toStorage())).toEqual([
      '10.0000',
      '0.0000',
      '20.0000',
    ]);
  });

  it('leaves transfers out of the net flow', () => {
    const report = build([
      fact('operating', 'in', '100'),
      fact('transfer', 'in', '70'),
      fact('transfer', 'out', '70'),
    ]);
    expect(row(report, 'netFlow').total.toStorage()).toBe('100.0000');
    expect(row(report, 'transfer').total.toStorage()).toBe('0.0000');
  });

  it('reaches closing from opening without a plug', () => {
    const report = build([fact('operating', 'in', '100')], {
      position: position({
        openingCash: Money.of('500', UZS),
        nonCashByPeriod: new Map([['2026-02' as MonthKey, Money.of('7', UZS)]]),
      }),
    });
    expect(row(report, OPENING_CASH_CODE).amounts.map((a) => a.toStorage())).toEqual([
      '500.0000',
      '600.0000',
      '607.0000',
    ]);
    expect(row(report, CLOSING_CASH_CODE).amounts.map((a) => a.toStorage())).toEqual([
      '600.0000',
      '607.0000',
      '607.0000',
    ]);
    expect(row(report, NON_CASH_CODE).total.toStorage()).toBe('7.0000');
  });

  it('totals a balance as a position, not a sum across months', () => {
    const report = build([], { position: position({ openingCash: Money.of('500', UZS) }) });
    expect(row(report, OPENING_CASH_CODE).total.toStorage()).toBe('500.0000');
    expect(row(report, CLOSING_CASH_CODE).total.toStorage()).toBe('500.0000');
  });

  it('groups by each dimension the cross-sections ask for', () => {
    const cases = [
      ['article', { articleId: 'a1', articleName: 'Revenue' }],
      ['direction', { directionId: 'd1', directionName: 'Retail' }],
      ['counterparty', { counterpartyId: 'c1', counterpartyName: 'Acme' }],
      ['account', { accountId: 'ac1', accountName: 'Main bank' }],
    ] as const;

    for (const [grouping, over] of cases) {
      const report = build([fact('operating', 'in', '100', over)], { grouping });
      const [part] = row(report, 'operating.in').breakdown;
      expect(part?.total.toStorage()).toBe('100.0000');
      expect(part?.label).not.toBeNull();
    }
  });

  it('keeps an untagged movement in its own bucket rather than dropping it', () => {
    const report = build(
      [fact('operating', 'in', '100'), fact('operating', 'in', '40', { articleId: 'a1' })],
      { grouping: 'article' },
    );
    const { breakdown } = row(report, 'operating.in');
    expect(breakdown).toHaveLength(2);
    expect(breakdown.some((part) => part.articleId === null)).toBe(true);
    expect(breakdown.reduce((sum, part) => sum.plus(part.total), zero).toStorage()).toBe(
      '140.0000',
    );
  });

  it('adds up repeated groups instead of overwriting them', () => {
    const report = build(
      [
        fact('operating', 'in', '100', { articleId: 'a1', articleName: 'A' }),
        fact('operating', 'in', '40', { articleId: 'a1', articleName: 'A' }),
      ],
      { grouping: 'article' },
    );
    expect(row(report, 'operating.in').breakdown).toHaveLength(1);
    expect(row(report, 'operating.in').breakdown[0]?.total.toStorage()).toBe('140.0000');
  });

  it('orders a breakdown largest first', () => {
    const report = build(
      [
        fact('operating', 'in', '40', { articleId: 'small', articleName: 'Small' }),
        fact('operating', 'in', '100', { articleId: 'big', articleName: 'Big' }),
      ],
      { grouping: 'article' },
    );
    expect(row(report, 'operating.in').breakdown.map((part) => part.articleId)).toEqual([
      'big',
      'small',
    ]);
  });

  it('leaves the breakdown empty when none was asked for', () => {
    const report = build([fact('operating', 'in', '100', { articleId: 'a1' })]);
    expect(row(report, 'operating.in').breakdown).toEqual([]);
  });

  it('fails loudly on a fact outside the report period, rather than dropping it', () => {
    expect(() => build([fact('operating', 'in', '1', { period: '2025-01' as MonthKey })])).toThrow(
      /outside the report period: 2025-01/,
    );
  });

  it('fails loudly on a structure that references a missing line', () => {
    const structure: CashFlowLineSpec[] = [
      {
        code: 'netFlow',
        labelKey: 'x',
        level: 0,
        kind: 'subtotal',
        components: [{ code: 'nope', sign: 1 }],
      },
    ];
    expect(() => build([], {}, structure)).toThrow(/cannot sum line: nope/);
  });

  it('fails loudly on a cycle instead of looping forever', () => {
    const subtotal = (code: string, to: string): CashFlowLineSpec => ({
      code,
      labelKey: 'x',
      level: 0,
      kind: 'subtotal',
      components: [{ code: to, sign: 1 }],
    });
    expect(() => build([], {}, [subtotal('a', 'b'), subtotal('b', 'a')])).toThrow(/cycle at: a/);
  });

  it('requires the structure to declare the lines it walks cash forward by', () => {
    // Not optional rows: opening and closing are walked from these.
    expect(() => build([], {}, [])).toThrow(/cannot sum line: netFlow/);
    expect(() =>
      build([], {}, [
        { code: 'netFlow', labelKey: 'x', level: 0, kind: 'subtotal', components: [] },
      ]),
    ).toThrow(/cannot sum line: transfer/);
  });

  it('carries a transfer into closing cash, because on one account it is real', () => {
    const report = build([fact('transfer', 'out', '30')], {
      position: position({ openingCash: Money.of('100', UZS) }),
    });
    expect(row(report, 'netFlow').total.toStorage()).toBe('0.0000');
    expect(row(report, CLOSING_CASH_CODE).total.toStorage()).toBe('70.0000');
  });

  it('fails loudly on a balance line it does not know how to fill', () => {
    const structure: CashFlowLineSpec[] = [
      { code: 'netFlow', labelKey: 'x', level: 0, kind: 'subtotal', components: [] },
      { code: 'transfer', labelKey: 'x', level: 0, kind: 'subtotal', components: [] },
      { code: 'orphan', labelKey: 'x', level: 0, kind: 'balance' },
    ];
    // Only `openingCash` and `closingCash` are positions the builder knows.
    expect(() => build([], {}, structure)).toThrow(/no amounts: orphan/);
  });
});

describe('contraRolesForCashFlowLine', () => {
  it('gives a flow line the roles of its section', () => {
    expect([...contraRolesForCashFlowLine('investing.out')].sort()).toEqual(
      ['accumulated_depreciation', 'fixed_asset'].sort(),
    );
  });

  it('unions a subtotal through its components', () => {
    expect([...contraRolesForCashFlowLine('netFlow')].sort()).toEqual(
      [
        ...rolesForSection('operating'),
        ...rolesForSection('investing'),
        ...rolesForSection('financing'),
      ].sort(),
    );
  });

  it('gives a balance line no contra roles — it is a position, not a movement', () => {
    expect(contraRolesForCashFlowLine(OPENING_CASH_CODE)).toEqual([]);
    expect(contraRolesForCashFlowLine(NON_CASH_CODE)).toEqual([]);
  });

  it('refuses a code that is not a line', () => {
    expect(() => contraRolesForCashFlowLine('nope')).toThrow(/Not a cash-flow line: nope/);
  });
});

describe('CASH_FLOW structure', () => {
  it('references only lines that exist, with unique codes', () => {
    const codes = new Set(CASH_FLOW.map((spec) => spec.code));
    expect(codes.size).toBe(CASH_FLOW.length);
    for (const spec of CASH_FLOW) {
      if (spec.kind !== 'subtotal') {
        continue;
      }
      for (const part of spec.components) {
        expect(codes.has(part.code)).toBe(true);
      }
    }
  });

  it('has no rounding adjustment or plug line', () => {
    expect(CASH_FLOW.filter((spec) => /adjust|rounding|plug|balancing/i.test(spec.code))).toEqual(
      [],
    );
  });
});
