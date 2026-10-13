import { describe, expect, it } from 'vitest';
import {
  GL_ACCOUNT_ROLES,
  Money,
  ROLE_ACCOUNT_TYPE,
  currency,
  isoDate,
  type FlowType,
  type GlAccountRole,
} from '@fincore/shared';
import {
  PNL,
  PNL_ROLES,
  buildPnl,
  matches,
  priorPeriod,
  type PnlFact,
  type PnlLineSpec,
  type PnlReport,
  type PnlValueLine,
} from '../../src/index.js';

const UZS = currency('UZS');
const FROM = isoDate('2026-01-01');
const TO = isoDate('2026-03-31');

function fact(role: GlAccountRole, amount: string, over: Partial<PnlFact> = {}): PnlFact {
  return {
    role,
    flowType: null,
    articleId: null,
    articleName: null,
    directionId: null,
    directionName: null,
    amount: Money.of(amount, UZS),
    ...over,
  };
}

const build = (
  facts: readonly PnlFact[],
  over: Partial<Parameters<typeof buildPnl>[1]> = {},
  prior: readonly PnlFact[] = [],
  structure?: readonly PnlLineSpec[],
): PnlReport =>
  buildPnl(
    facts,
    { from: FROM, to: TO, currency: UZS, grouping: 'none', comparison: null, ...over },
    prior,
    structure,
  );

function row(report: PnlReport, code: string) {
  const found = report.rows.find((r) => r.code === code);
  if (found === undefined) {
    throw new Error(`no row ${code}`);
  }
  return found;
}

const amount = (report: PnlReport, code: string): string =>
  row(report, code).amount?.toStorage() ?? 'null';

describe('P&L structure', () => {
  it('claims exactly the income and expense roles, plus owner draws', () => {
    const expected = GL_ACCOUNT_ROLES.filter(
      (role) => ROLE_ACCOUNT_TYPE[role] === 'income' || ROLE_ACCOUNT_TYPE[role] === 'expense',
    );
    expect([...PNL_ROLES].sort()).toEqual([...expected, 'owner_draw'].sort());
  });

  it('lists every role it claims on some line', () => {
    const onLines = new Set<GlAccountRole>();
    for (const spec of PNL) {
      if (spec.kind === 'value') {
        for (const role of spec.roles) {
          onLines.add(role);
        }
      }
    }
    expect([...onLines].sort()).toEqual([...PNL_ROLES].sort());
  });

  it('references only lines that exist, with unique codes', () => {
    const codes = new Set(PNL.map((s) => s.code));
    expect(codes.size).toBe(PNL.length);
    for (const spec of PNL) {
      if (spec.kind === 'subtotal') {
        for (const component of spec.components) {
          expect([spec.code, component.code, codes.has(component.code)]).toEqual([
            spec.code,
            component.code,
            true,
          ]);
        }
      }
      if (spec.kind === 'margin') {
        expect(codes.has(spec.numerator)).toBe(true);
        expect(codes.has(spec.denominator)).toBe(true);
      }
    }
  });

  it('follows the §7.2 order', () => {
    expect(PNL.map((s) => s.code)).toEqual([
      'revenue',
      'cogs',
      'grossProfit',
      'grossMargin',
      'opexVariable',
      'marginalProfit',
      'marginalMargin',
      'opexFixed',
      'opexUnclassified',
      'ebitda',
      'ebitdaMargin',
      'depreciation',
      'interest',
      'tax',
      'fxDifference',
      'otherIncome',
      'netProfit',
      'netMargin',
      'dividends',
      'retained',
    ]);
  });

  it('has no rounding adjustment line', () => {
    for (const spec of PNL) {
      expect(spec.code.toLowerCase()).not.toContain('round');
      expect(spec.code.toLowerCase()).not.toContain('adjust');
    }
  });
});

describe('matches', () => {
  const variable = PNL.find((s): s is PnlValueLine => s.code === 'opexVariable');
  const fixed = PNL.find((s): s is PnlValueLine => s.code === 'opexFixed');
  const unclassified = PNL.find((s): s is PnlValueLine => s.code === 'opexUnclassified');
  const revenue = PNL.find((s): s is PnlValueLine => s.code === 'revenue');

  it('filters by role before anything else', () => {
    expect(matches(revenue!, fact('revenue', '1'))).toBe(true);
    expect(matches(revenue!, fact('expense', '1'))).toBe(false);
  });

  it('ignores flow type when a line does not filter on it', () => {
    expect(matches(revenue!, fact('revenue', '1', { flowType: 'opex_fixed' }))).toBe(true);
  });

  it('splits the expense role into variable and fixed', () => {
    const v = fact('expense', '1', { flowType: 'opex_variable' });
    const f = fact('expense', '1', { flowType: 'opex_fixed' });
    expect([matches(variable!, v), matches(fixed!, v)]).toEqual([true, false]);
    expect([matches(variable!, f), matches(fixed!, f)]).toEqual([false, true]);
  });

  it('sends an expense with no article to the unclassified bucket', () => {
    const none = fact('expense', '1', { flowType: null });
    expect(matches(unclassified!, none)).toBe(true);
    expect(matches(variable!, none)).toBe(false);
    expect(matches(fixed!, none)).toBe(false);
  });

  it('sends an expense tagged with an unexpected flow type to unclassified too', () => {
    // A mis-tagged article must surface on its own line, not vanish and not be
    // folded quietly into fixed costs.
    const odd = fact('expense', '1', { flowType: 'transfer' as FlowType });
    expect(matches(unclassified!, odd)).toBe(true);
    expect(matches(variable!, odd)).toBe(false);
    expect(matches(fixed!, odd)).toBe(false);
  });

  it('partitions every flow type across the three expense lines exactly once', () => {
    const flows: (FlowType | null)[] = [
      null,
      'revenue',
      'cogs',
      'opex_variable',
      'opex_fixed',
      'below_ebitda',
      'below_net_profit',
      'financing',
      'investing',
      'transfer',
    ];
    for (const flowType of flows) {
      const f = fact('expense', '1', { flowType });
      const hits = [variable!, fixed!, unclassified!].filter((spec) => matches(spec, f));
      expect([flowType, hits.length]).toEqual([flowType, 1]);
    }
  });
});

describe('buildPnl', () => {
  it('computes the §7.2 chain down to retained', () => {
    const report = build([
      fact('revenue', '1000'),
      fact('cost_of_sales', '300'),
      fact('expense', '100', { flowType: 'opex_variable' }),
      fact('expense', '200', { flowType: 'opex_fixed' }),
      fact('depreciation', '50'),
    ]);

    expect(amount(report, 'revenue')).toBe('1000.0000');
    expect(amount(report, 'grossProfit')).toBe('700.0000');
    expect(amount(report, 'marginalProfit')).toBe('600.0000');
    expect(amount(report, 'ebitda')).toBe('400.0000');
    expect(amount(report, 'netProfit')).toBe('350.0000');
    expect(amount(report, 'retained')).toBe('350.0000');
  });

  it('derives margins and leaves them off value rows', () => {
    const report = build([fact('revenue', '1000'), fact('cost_of_sales', '250')]);
    expect(row(report, 'grossMargin').percent).toBe('75.0000');
    expect(row(report, 'grossMargin').amount).toBeNull();
    expect(row(report, 'revenue').percent).toBeNull();
  });

  it('returns null rather than a margin against zero revenue', () => {
    const report = build([fact('expense', '40', { flowType: 'opex_fixed' })]);
    expect(row(report, 'grossMargin').percent).toBeNull();
    expect(row(report, 'ebitdaMargin').percent).toBeNull();
    expect(amount(report, 'ebitda')).toBe('-40.0000');
  });

  it('puts dividends below net profit', () => {
    const report = build([fact('revenue', '500'), fact('owner_draw', '120')]);
    expect(amount(report, 'netProfit')).toBe('500.0000');
    expect(amount(report, 'dividends')).toBe('120.0000');
    expect(amount(report, 'retained')).toBe('380.0000');
  });

  it('adds other income and subtracts the below-EBITDA block', () => {
    const report = build([
      fact('revenue', '1000'),
      fact('depreciation', '100'),
      fact('interest_expense', '40'),
      fact('tax_expense', '60'),
      fact('fx_difference', '-25'),
      fact('other_income', '15'),
    ]);
    expect(amount(report, 'ebitda')).toBe('1000.0000');
    // 1000 − 100 − 40 − 60 − (−25) + 15
    expect(amount(report, 'netProfit')).toBe('840.0000');
  });

  it('surfaces unclassified expenses on their own line', () => {
    const report = build([fact('revenue', '1000'), fact('expense', '70', { flowType: null })]);
    expect(amount(report, 'opexUnclassified')).toBe('70.0000');
    expect(amount(report, 'ebitda')).toBe('930.0000');
  });

  it('leaves comparison fields null when no comparison was asked for', () => {
    const report = build([fact('revenue', '100')]);
    const r = row(report, 'revenue');
    expect([r.priorAmount, r.delta, r.deltaPercent, r.priorPercent]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(report.comparison).toBeNull();
  });

  it('computes delta and delta percent against the comparison period', () => {
    const comparison = { from: isoDate('2025-10-01'), to: isoDate('2025-12-31') };
    const report = build([fact('revenue', '150')], { comparison }, [fact('revenue', '100')]);
    const r = row(report, 'revenue');
    expect(r.priorAmount?.toStorage()).toBe('100.0000');
    expect(r.delta?.toStorage()).toBe('50.0000');
    expect(r.deltaPercent).toBe('50.0000');
    expect(row(report, 'grossMargin').priorPercent).toBe('100.0000');
  });

  it('returns no delta percent when the prior figure is zero', () => {
    const comparison = { from: isoDate('2025-10-01'), to: isoDate('2025-12-31') };
    const report = build([fact('revenue', '150')], { comparison }, []);
    expect(row(report, 'revenue').deltaPercent).toBeNull();
    expect(row(report, 'revenue').priorAmount?.toStorage()).toBe('0.0000');
  });

  it('groups by article, largest first', () => {
    const report = build(
      [
        fact('revenue', '300', { articleId: 'a1', articleName: 'Projects' }),
        fact('revenue', '700', { articleId: 'a2', articleName: 'Retainers' }),
      ],
      { grouping: 'article' },
    );
    const breakdown = row(report, 'revenue').breakdown;
    expect(breakdown.map((b) => [b.articleName, b.amount.toStorage()])).toEqual([
      ['Retainers', '700.0000'],
      ['Projects', '300.0000'],
    ]);
  });

  it('groups by direction, and by direction crossed with article', () => {
    const facts = [
      fact('revenue', '100', {
        articleId: 'a1',
        articleName: 'A',
        directionId: 'd1',
        directionName: 'Wholesale',
      }),
      fact('revenue', '200', {
        articleId: 'a2',
        articleName: 'B',
        directionId: 'd1',
        directionName: 'Wholesale',
      }),
    ];
    expect(
      build(facts, { grouping: 'direction' }).rows.find((r) => r.code === 'revenue')?.breakdown,
    ).toHaveLength(1);
    expect(
      build(facts, { grouping: 'direction_article' }).rows.find((r) => r.code === 'revenue')
        ?.breakdown,
    ).toHaveLength(2);
  });

  it('keeps unassigned dimensions in their own bucket rather than dropping them', () => {
    const report = build(
      [fact('revenue', '80'), fact('revenue', '20', { articleId: 'a1', articleName: 'A' })],
      { grouping: 'article' },
    );
    const breakdown = row(report, 'revenue').breakdown;
    expect(breakdown).toHaveLength(2);
    expect(breakdown.reduce((acc, b) => acc.plus(b.amount), Money.zero(UZS)).toStorage()).toBe(
      '100.0000',
    );
  });

  it('carries prior-period figures into the breakdown', () => {
    const comparison = { from: isoDate('2025-10-01'), to: isoDate('2025-12-31') };
    const report = build(
      [fact('revenue', '150', { articleId: 'a1', articleName: 'A' })],
      { comparison, grouping: 'article' },
      [fact('revenue', '90', { articleId: 'a1', articleName: 'A' })],
    );
    expect(row(report, 'revenue').breakdown[0]?.priorAmount?.toStorage()).toBe('90.0000');
  });

  it('leaves the breakdown empty when no grouping was asked for', () => {
    const report = build([fact('revenue', '1', { articleId: 'a1', articleName: 'A' })]);
    expect(row(report, 'revenue').breakdown).toEqual([]);
  });

  it('carries a zero rather than the current figure when a group is new', () => {
    const comparison = { from: isoDate('2025-10-01'), to: isoDate('2025-12-31') };
    const report = build(
      [fact('revenue', '150', { articleId: 'new', articleName: 'New' })],
      { comparison, grouping: 'article' },
      [fact('revenue', '90', { articleId: 'old', articleName: 'Old' })],
    );
    expect(row(report, 'revenue').breakdown).toHaveLength(1);
    expect(row(report, 'revenue').breakdown[0]?.priorAmount?.toStorage()).toBe('0.0000');
  });

  it('derives the comparison period margins too', () => {
    const comparison = { from: isoDate('2025-10-01'), to: isoDate('2025-12-31') };
    const report = build([fact('revenue', '200'), fact('cost_of_sales', '50')], { comparison }, [
      fact('revenue', '100'),
      fact('cost_of_sales', '40'),
    ]);
    expect(row(report, 'grossMargin').percent).toBe('75.0000');
    expect(row(report, 'grossMargin').priorPercent).toBe('60.0000');
    expect(row(report, 'grossMargin').amount).toBeNull();
    expect(row(report, 'grossMargin').priorAmount).toBeNull();
  });

  it('fails loudly on a structure that references a missing line', () => {
    const structure: PnlLineSpec[] = [
      {
        code: 'netProfit',
        labelKey: 'x',
        level: 0,
        kind: 'subtotal',
        components: [{ code: 'nope', sign: 1 }],
      },
    ];
    expect(() => build([], {}, [], structure)).toThrow(/cannot sum line: nope/);
  });

  it('refuses to sum a margin, which is a percentage and not an amount', () => {
    const structure: PnlLineSpec[] = [
      {
        code: 'revenue',
        labelKey: 'x',
        level: 0,
        kind: 'value',
        roles: ['revenue'],
        flowTypes: null,
      },
      {
        code: 'ros',
        labelKey: 'x',
        level: 1,
        kind: 'margin',
        numerator: 'revenue',
        denominator: 'revenue',
      },
      {
        code: 'bad',
        labelKey: 'x',
        level: 0,
        kind: 'subtotal',
        components: [{ code: 'ros', sign: 1 }],
      },
    ];
    expect(() => build([], {}, [], structure)).toThrow(/cannot sum line: ros/);
  });

  it('fails loudly on a margin measured against a line that has no amount', () => {
    const structure: PnlLineSpec[] = [
      {
        code: 'ros',
        labelKey: 'x',
        level: 1,
        kind: 'margin',
        numerator: 'revenue',
        denominator: 'missing',
      },
    ];
    expect(() => build([], {}, [], structure)).toThrow(/no amount: revenue/);
  });

  it('fails loudly on a cycle instead of looping forever', () => {
    const structure: PnlLineSpec[] = [
      {
        code: 'a',
        labelKey: 'x',
        level: 0,
        kind: 'subtotal',
        components: [{ code: 'b', sign: 1 }],
      },
      {
        code: 'b',
        labelKey: 'x',
        level: 0,
        kind: 'subtotal',
        components: [{ code: 'a', sign: 1 }],
      },
    ];
    expect(() => build([], {}, [], structure)).toThrow(/cycle at: a/);
  });
});

describe('priorPeriod', () => {
  it('returns the previous calendar month for a whole month', () => {
    expect(priorPeriod({ from: isoDate('2026-03-01'), to: isoDate('2026-03-31') })).toEqual({
      from: isoDate('2026-02-01'),
      to: isoDate('2026-02-28'),
    });
  });

  it('returns the previous quarter for a whole quarter', () => {
    expect(priorPeriod({ from: isoDate('2026-04-01'), to: isoDate('2026-06-30') })).toEqual({
      from: isoDate('2026-01-01'),
      to: isoDate('2026-03-31'),
    });
  });

  it('returns the previous year for a whole year', () => {
    expect(priorPeriod({ from: isoDate('2026-01-01'), to: isoDate('2026-12-31') })).toEqual({
      from: isoDate('2025-01-01'),
      to: isoDate('2025-12-31'),
    });
  });

  it('crosses a year boundary for January', () => {
    expect(priorPeriod({ from: isoDate('2026-01-01'), to: isoDate('2026-01-31') })).toEqual({
      from: isoDate('2025-12-01'),
      to: isoDate('2025-12-31'),
    });
  });

  it('falls back to an equally long window for a custom range', () => {
    expect(priorPeriod({ from: isoDate('2026-03-10'), to: isoDate('2026-03-20') })).toEqual({
      from: isoDate('2026-02-27'),
      to: isoDate('2026-03-09'),
    });
  });

  it('handles a single day', () => {
    expect(priorPeriod({ from: isoDate('2026-03-02'), to: isoDate('2026-03-02') })).toEqual({
      from: isoDate('2026-03-01'),
      to: isoDate('2026-03-01'),
    });
  });
});
