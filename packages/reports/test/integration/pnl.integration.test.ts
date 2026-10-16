import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import { seedDemo, type SeedResult } from '@fincore/seed';
import { Money, auditMessages, currency, declaredKeys, isoDate } from '@fincore/shared';
import {
  PNL,
  PNL_ROLES,
  rolesForBalanceSheetLine,
  REPORT_MESSAGES,
  createReports,
  priorPeriod,
  type PnlReport,
  type Reports,
} from '../../src/index.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'pnl.txt');
const FROM = isoDate('2026-01-01');
const TO = isoDate('2026-03-31');
const UZS = currency('UZS');

let h: TestDatabase;
let reports: Reports;
let seeded: SeedResult;

beforeAll(async () => {
  h = await createTestDatabase();
  reports = createReports(h.db);
  seeded = await seedDemo(h.db);
}, 300_000);

afterAll(async () => {
  await h.close();
});

function row(report: PnlReport, code: string) {
  const found = report.rows.find((r) => r.code === code);
  if (found === undefined) {
    throw new Error(`no row ${code}`);
  }
  return found;
}

function render(report: PnlReport): string {
  const rows = report.rows.map((line) => {
    const indent = '  '.repeat(line.level);
    const label = `${indent}${REPORT_MESSAGES.en[line.labelKey] ?? line.labelKey}`;
    const figure =
      line.kind === 'margin' ? (line.percent ?? '—') : (line.amount?.toStorage() ?? '—');
    return `${label.padEnd(40)}${figure.padStart(20)}`;
  });
  return [
    `PROFIT AND LOSS ${report.from} .. ${report.to} (${report.currency})`,
    '='.repeat(60),
    ...rows,
    '',
  ].join('\n');
}

describe('getPnl', () => {
  it('returns one report per functional currency', async () => {
    const result = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    expect(result).toHaveLength(1);
    expect(result[0]?.currency).toBe(UZS);
    expect(result[0]?.grouping).toBe('none');
  });

  it('accounts for every income and expense line in the ledger', async () => {
    // The strongest guarantee available: the P&L's own net profit must equal
    // the ledger's income minus expense for the period. If a line is dropped or
    // double-counted by the structure, this fails.
    const [report] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    expect(report).toBeDefined();
    if (report === undefined) return;

    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ value: string }[]>`
        select coalesce(sum(
          case when g.type = 'income'
               then case when l.side = 'C' then l.amount_functional
                         else -l.amount_functional end
               -- Expenses reduce the result, so they come in negative here.
               else case when l.side = 'D' then -l.amount_functional
                         else l.amount_functional end
          end), 0) as value
          from journal_line l
          join journal_entry e on e.id = l.entry_id
          join gl_account g on g.id = l.gl_account_id
         where g.type in ('income', 'expense')
           and e.accrual_date between ${FROM} and ${TO}`,
    );
    // The ledger figure is income − expense; net profit is the same thing read
    // through the structure, before dividends.
    expect(row(report, 'netProfit').amount?.toStorage()).toBe(
      Money.of(rows[0]?.value ?? '0', UZS).toStorage(),
    );
  });

  it('derives margins against revenue', async () => {
    const [report] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    if (report === undefined) throw new Error('no report');

    const revenue = row(report, 'revenue').amount;
    const ebitda = row(report, 'ebitda').amount;
    expect(revenue?.isPositive()).toBe(true);
    expect(row(report, 'ebitdaMargin').percent).not.toBeNull();
    // Recomputed independently of the report's own arithmetic.
    const expected = (Number(ebitda?.toStorage()) / Number(revenue?.toStorage())) * 100;
    expect(Number(row(report, 'ebitdaMargin').percent)).toBeCloseTo(expected, 3);
  });

  it('compares against the previous calendar quarter', async () => {
    const [report] = await reports.getPnl({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      compareTo: 'prior',
    });
    if (report === undefined) throw new Error('no report');

    expect(report.comparison).toEqual(priorPeriod({ from: FROM, to: TO }));
    // Nothing was posted before the window, so every prior figure is zero and
    // no delta percent can be computed against it.
    expect(row(report, 'revenue').priorAmount?.toStorage()).toBe('0.0000');
    expect(row(report, 'revenue').deltaPercent).toBeNull();
    expect(row(report, 'revenue').delta?.toStorage()).toBe(
      row(report, 'revenue').amount?.toStorage(),
    );
  });

  it('compares two real periods when both have data', async () => {
    const [report] = await reports.getPnl({
      orgId: seeded.reference.orgId,
      from: isoDate('2026-03-01'),
      to: isoDate('2026-03-31'),
      compareTo: 'prior',
    });
    if (report === undefined) throw new Error('no report');

    expect(report.comparison).toEqual({ from: isoDate('2026-02-01'), to: isoDate('2026-02-28') });
    expect(row(report, 'revenue').priorAmount?.isPositive()).toBe(true);
    expect(row(report, 'revenue').deltaPercent).not.toBeNull();
  });

  it('breaks each line down by article, direction and both', async () => {
    for (const grouping of ['article', 'direction', 'direction_article'] as const) {
      const [report] = await reports.getPnl({
        orgId: seeded.reference.orgId,
        from: FROM,
        to: TO,
        grouping,
      });
      if (report === undefined) throw new Error('no report');

      const revenue = row(report, 'revenue');
      expect([grouping, revenue.breakdown.length > 0]).toEqual([grouping, true]);
      // A breakdown that does not add up to its line is worse than none.
      const summed = revenue.breakdown.reduce((acc, b) => acc.plus(b.amount), Money.zero(UZS));
      expect([grouping, summed.toStorage()]).toEqual([grouping, revenue.amount?.toStorage()]);
    }
  });

  it('keeps the unclassified expense line at zero on the seeded ledger', async () => {
    const [report] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    expect(row(report!, 'opexUnclassified').amount?.toStorage()).toBe('0.0000');
  });

  it('reports per legal entity', async () => {
    const [company] = await reports.getPnl({
      orgId: seeded.reference.orgId,
      legalEntityIds: [seeded.reference.companyEntityId],
      from: FROM,
      to: TO,
    });
    const [trader] = await reports.getPnl({
      orgId: seeded.reference.orgId,
      legalEntityIds: [seeded.reference.soleTraderEntityId],
      from: FROM,
      to: TO,
    });
    const [both] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });

    expect(row(company!, 'revenue').amount!.plus(row(trader!, 'revenue').amount!).toStorage()).toBe(
      row(both!, 'revenue').amount?.toStorage(),
    );
  });

  it('reads one tenant at a time, never both (I8)', async () => {
    const [demo] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    const [other] = await reports.getPnl({ orgId: seeded.otherOrgId, from: FROM, to: TO });
    if (demo === undefined || other === undefined) throw new Error('no report');

    // The seed runs the same deterministic generator for both tenants, so their
    // figures are identical. That makes this the sharpest possible leak test:
    // if a query lost its tenant filter, the demo figure would be exactly
    // double its own ledger, and the cross-check test above would fail too.
    expect(other.rows.map((r) => r.amount?.toStorage() ?? r.percent)).toEqual(
      demo.rows.map((r) => r.amount?.toStorage() ?? r.percent),
    );
    expect(row(demo, 'revenue').amount?.isPositive()).toBe(true);
  });

  it('translates every label this structure asks for', () => {
    // The unused-key half lives in the cash-flow suite, which audits every
    // structure at once; a per-structure audit calls the others' keys unused.
    const keys = declaredKeys(PNL.map((spec) => spec.labelKey));
    expect(auditMessages(REPORT_MESSAGES, keys).missing).toEqual([]);
  });

  it('matches the checked-in golden file', async () => {
    const [report] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    if (report === undefined) throw new Error('no report');

    const actual = render(report);
    if (process.env['UPDATE_GOLDEN'] === '1') {
      await writeFile(GOLDEN, actual, 'utf8');
    }
    expect(actual).toBe(await readFile(GOLDEN, 'utf8'));
  });
});

describe('reconcilePnl — net profit against the movement in equity', () => {
  it('ties exactly, to the cent', async () => {
    const [check] = await reports.reconcilePnl({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
    });
    expect(check).toBeDefined();
    if (check === undefined) return;

    // ΔEquity = net profit + contributions − draws. This is the check the whole
    // single-ledger design exists to make possible; a non-zero residual is a
    // bug upstream, never something to plug.
    expect(check.residual.toStorage()).toBe('0.0000');
    expect(check.isReconciled).toBe(true);
    expect(check.netProfit.isPositive()).toBe(true);
    expect(check.contributions.isPositive()).toBe(true);
    // The seed's opening entry credits retained earnings as well as capital.
    expect(check.broughtForward.isPositive()).toBe(true);
    expect(check.draws.toStorage()).toBe('0.0000');
  });

  it('ties for each month on its own', async () => {
    for (const [from, to] of [
      [isoDate('2026-01-01'), isoDate('2026-01-31')],
      [isoDate('2026-02-01'), isoDate('2026-02-28')],
      [isoDate('2026-03-01'), isoDate('2026-03-31')],
    ] as const) {
      const [check] = await reports.reconcilePnl({ orgId: seeded.reference.orgId, from, to });
      expect([from, check?.residual.toStorage()]).toEqual([from, '0.0000']);
    }
  });

  it('ties for each legal entity on its own', async () => {
    for (const legalEntityId of [
      seeded.reference.companyEntityId,
      seeded.reference.soleTraderEntityId,
    ]) {
      const [check] = await reports.reconcilePnl({
        orgId: seeded.reference.orgId,
        legalEntityIds: [legalEntityId],
        from: FROM,
        to: TO,
      });
      expect([legalEntityId, check?.isReconciled]).toEqual([legalEntityId, true]);
    }
  });

  it('ties for the neighbour tenant too', async () => {
    const [check] = await reports.reconcilePnl({ orgId: seeded.otherOrgId, from: FROM, to: TO });
    expect(check?.residual.toStorage()).toBe('0.0000');
  });
});

describe('getLedgerLines — the first of the three clicks (I3)', () => {
  it('has no lower bound when `from` is omitted, as a balance-sheet line needs', async () => {
    const roles = rolesForBalanceSheetLine('equity');
    const cutoff = isoDate('2026-02-01');
    const scope = { orgId: seeded.reference.orgId, to: isoDate('2026-02-15'), roles, limit: 2000 };

    const cumulative = await reports.getLedgerLines(scope);
    const inPeriod = await reports.getLedgerLines({ ...scope, from: cutoff });

    // The seed's opening balances sit on the ledger's first day, before the
    // cutoff. A balance-sheet figure must see them; a P&L period must not.
    expect(cumulative.length).toBeGreaterThan(inPeriod.length);
    expect(cumulative.some((line) => line.accrualDate < cutoff)).toBe(true);
    expect(inPeriod.every((line) => line.accrualDate >= cutoff)).toBe(true);
  });

  it('returns the lines behind a figure, each with its source marker', async () => {
    const lines = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: ['revenue'],
    });
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      expect(line.sourceType.length).toBeGreaterThan(0);
      expect(line.amountFunctional.isPositive()).toBe(true);
      expect(line.side).toBe('C');
    }
    // Ordered by date so a drill-down reads chronologically.
    const dates = lines.map((l) => l.accrualDate);
    expect([...dates].sort()).toEqual(dates);
  });

  it('adds up to the figure it was opened from', async () => {
    const [report] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    const lines = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: ['revenue'],
      limit: 10_000,
    });
    const summed = lines.reduce(
      (acc, line) =>
        line.side === 'C' ? acc.plus(line.amountFunctional) : acc.minus(line.amountFunctional),
      Money.zero(UZS),
    );
    expect(summed.toStorage()).toBe(row(report!, 'revenue').amount?.toStorage());
  });

  it('narrows by article and by direction', async () => {
    const [grouped] = await reports.getPnl({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      grouping: 'article',
    });
    const cell = row(grouped!, 'revenue').breakdown[0];
    expect(cell?.articleId).not.toBeNull();

    const lines = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: ['revenue'],
      articleId: cell?.articleId ?? null,
      limit: 10_000,
    });
    const summed = lines.reduce((acc, line) => acc.plus(line.amountFunctional), Money.zero(UZS));
    expect(summed.toStorage()).toBe(cell?.amount.toStorage());

    const byDirection = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: ['revenue'],
      directionId: seeded.reference.directionIds[0] ?? null,
      limit: 10_000,
    });
    expect(byDirection.length).toBeGreaterThan(0);
    expect(byDirection.length).toBeLessThan(
      (
        await reports.getLedgerLines({
          orgId: seeded.reference.orgId,
          from: FROM,
          to: TO,
          roles: ['revenue'],
          limit: 10_000,
        })
      ).length,
    );
  });

  it('respects the row limit and the legal-entity scope', async () => {
    const capped = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: [...PNL_ROLES],
      limit: 5,
    });
    expect(capped).toHaveLength(5);

    const perEntity = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      legalEntityIds: [seeded.reference.soleTraderEntityId],
      from: FROM,
      to: TO,
      roles: ['revenue'],
      limit: 10_000,
    });
    expect(perEntity.length).toBeGreaterThan(0);
    expect(perEntity.every((l) => l.sourceType === 'bank_statement')).toBe(true);
  });

  it('shows the FX revaluation with its own source marker', async () => {
    const lines = await reports.getLedgerLines({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      roles: ['fx_difference'],
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.sourceType).toBe('period_close');
    expect(lines[0]?.kind).toBe('fx_revaluation');
    // No article: this is exactly the line an article-driven P&L would lose.
    expect(lines[0]?.articleName).toBeNull();
  });
});
