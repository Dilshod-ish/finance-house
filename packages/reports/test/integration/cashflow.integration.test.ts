import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import { seedDemo, type SeedResult } from '@fincore/seed';
import {
  GL_ACCOUNT_ROLES,
  Money,
  auditMessages,
  currency,
  declaredKeys,
  isoDate,
} from '@fincore/shared';
import {
  BALANCE_SHEET,
  CASH_FLOW,
  PNL,
  REPORT_MESSAGES,
  REPORT_MESSAGE_KEYS,
  SECTION_BY_CONTRA_ROLE,
  contraRolesForCashFlowLine,
  createReports,
  type CashFlowReport,
  type Reports,
} from '../../src/index.js';

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
});

afterAll(async () => {
  await h.close();
});

const statement = async (over: Record<string, unknown> = {}): Promise<CashFlowReport> => {
  const [report] = await reports.getCashFlow({
    orgId: seeded.reference.orgId,
    from: FROM,
    to: TO,
    ...over,
  });
  if (report === undefined) {
    throw new Error('no cash flow statement');
  }
  return report;
};

const row = (report: CashFlowReport, code: string) => {
  const found = report.rows.find((candidate) => candidate.code === code);
  if (found === undefined) {
    throw new Error(`no row ${code}`);
  }
  return found;
};

const total = (report: CashFlowReport, code: string): string => row(report, code).total.toStorage();

describe('cash flow — the shape of it', () => {
  it('has a column per month the range touches', async () => {
    const report = await statement();
    expect(report.periods).toEqual(['2026-01', '2026-02', '2026-03']);
    for (const line of report.rows) {
      expect(line.amounts).toHaveLength(3);
    }
  });

  it('includes a month in which nothing happened', async () => {
    const report = await statement({ from: isoDate('2025-11-01'), to: TO });
    expect(report.periods).toEqual(['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
    expect(row(report, 'operating.in').amounts[0]?.toStorage()).toBe('0.0000');
  });

  it('shows inflows and outflows gross, never netted into one figure', async () => {
    const report = await statement();
    expect(Number(total(report, 'operating.in'))).toBeGreaterThan(0);
    expect(Number(total(report, 'operating.out'))).toBeGreaterThan(0);
    expect(total(report, 'operating')).toBe(
      Money.of(total(report, 'operating.in'), UZS)
        .minus(Money.of(total(report, 'operating.out'), UZS))
        .toStorage(),
    );
  });
});

describe('cash flow — I5 and I6, which are the whole report', () => {
  it('ties to the ledger cash balance with no plug (PRD §7.5)', async () => {
    const checks = await reports.reconcileCashFlow({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
    });
    expect(checks.length).toBeGreaterThan(0);
    for (const check of checks) {
      expect(check.residual.toStorage()).toBe('0.0000');
      expect(check.isReconciled).toBe(true);
    }
  });

  it('opens where the previous month closed, every month', async () => {
    const report = await statement();
    const opening = row(report, 'openingCash').amounts;
    const closing = row(report, 'closingCash').amounts;
    for (let index = 1; index < report.periods.length; index += 1) {
      expect(opening[index]?.toStorage()).toBe(closing[index - 1]?.toStorage());
    }
  });

  it('reaches closing from opening by what moved alone, with no plug', async () => {
    const report = await statement();
    const series = (code: string) => row(report, code).amounts;
    const zero = Money.zero(UZS);

    for (let index = 0; index < report.periods.length; index += 1) {
      const expected = (series('openingCash')[index] ?? zero)
        .plus(series('netFlow')[index] ?? zero)
        .plus(series('transfer')[index] ?? zero)
        .plus(series('nonCashChange')[index] ?? zero);
      expect(series('closingCash')[index]?.toStorage()).toBe(expected.toStorage());
    }
  });

  it('keeps the FX revaluation out of the flows and in the non-cash line (I6)', async () => {
    const report = await statement();
    // The seed revalues the foreign bank account at period end with no
    // cash_date: the balance moves, no money does.
    expect(row(report, 'nonCashChange').total.isZero()).toBe(false);
  });

  it('dates a movement by cash_date, not accrual_date (I6)', async () => {
    // The seed accrues 18 invoices a month and settles 15, three days later.
    // If the report read accrual_date the two would be indistinguishable.
    const [pnl] = await reports.getPnl({ orgId: seeded.reference.orgId, from: FROM, to: TO });
    const revenue = pnl?.rows.find((line) => line.code === 'revenue')?.amount;
    const report = await statement();
    expect(revenue).not.toBeUndefined();
    expect(total(report, 'operating.in')).not.toBe(revenue?.toStorage());
  });
});

describe('cash flow — opening a statement mid-stream', () => {
  it('opens on the balance the ledger already held, not on zero', async () => {
    const march = await statement({ from: isoDate('2026-03-01'), to: TO });
    const whole = await statement();

    expect(march.periods).toEqual(['2026-03']);
    // March opens where February closed on the full-quarter statement.
    expect(row(march, 'openingCash').total.toStorage()).toBe(
      row(whole, 'closingCash').amounts[1]?.toStorage(),
    );
    expect(row(march, 'openingCash').total.isZero()).toBe(false);
    expect(row(march, 'closingCash').total.toStorage()).toBe(
      row(whole, 'closingCash').total.toStorage(),
    );
  });

  it('still ties to the ledger when the period starts mid-stream', async () => {
    const [check] = await reports.reconcileCashFlow({
      orgId: seeded.reference.orgId,
      from: isoDate('2026-03-01'),
      to: TO,
    });
    expect(check?.residual.toStorage()).toBe('0.0000');
  });
});

describe('cash flow — scoped to one legal entity', () => {
  it('shows that entity alone, and the entities add up to the organization', async () => {
    const company = await statement({ legalEntityIds: [seeded.reference.companyEntityId] });
    const trader = await statement({ legalEntityIds: [seeded.reference.soleTraderEntityId] });
    const both = await statement();

    for (const code of ['operating.in', 'operating.out', 'netFlow', 'closingCash']) {
      const parts = Money.of(total(company, code), UZS).plus(Money.of(total(trader, code), UZS));
      expect(total(both, code)).toBe(parts.toStorage());
    }
  });

  it('ties to the ledger for one entity on its own', async () => {
    const [check] = await reports.reconcileCashFlow({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      legalEntityIds: [seeded.reference.soleTraderEntityId],
    });
    expect(check?.residual.toStorage()).toBe('0.0000');
    expect(check?.closingCash.isZero()).toBe(false);
  });
});

describe('cash flow — transfers between own accounts', () => {
  it('nets to zero over the organization, because it is the same money twice', async () => {
    const report = await statement();
    expect(total(report, 'transfer')).toBe('0.0000');
    expect(Number(total(report, 'transfer.in'))).toBeGreaterThan(0);
  });

  it('is left out of the net flow', async () => {
    const report = await statement();
    const expected = Money.of(total(report, 'operating'), UZS)
      .plus(Money.of(total(report, 'investing'), UZS))
      .plus(Money.of(total(report, 'financing'), UZS));
    expect(total(report, 'netFlow')).toBe(expected.toStorage());
  });

  it('ties to the ledger for one account on its own', async () => {
    const [check] = await reports.reconcileCashFlow({
      orgId: seeded.reference.orgId,
      from: FROM,
      to: TO,
      accountIds: [seeded.reference.accounts.companyBankLocal],
    });
    expect(check?.residual.toStorage()).toBe('0.0000');
    expect(check?.closingCash.isZero()).toBe(false);
  });

  it('still shows on one account alone, where it is a real movement', async () => {
    const cashDesk = seeded.reference.accounts.companyCash;
    const report = await statement({ accountIds: [cashDesk] });
    expect(Number(total(report, 'transfer.in'))).toBeGreaterThan(0);
    expect(total(report, 'transfer.out')).toBe('0.0000');
  });
});

describe('cash flow — the §7.1 cross-sections', () => {
  it('breaks down by article, direction, counterparty and account', async () => {
    for (const grouping of ['article', 'direction', 'counterparty', 'account'] as const) {
      const report = await statement({ grouping });
      const operating = row(report, 'operating.in');
      expect(operating.breakdown.length).toBeGreaterThan(0);
      const sum = operating.breakdown.reduce(
        (running, part) => running.plus(part.total),
        Money.zero(UZS),
      );
      // A breakdown that does not add up to its line is the bug this catches.
      expect(sum.toStorage()).toBe(operating.total.toStorage());
    }
  });

  it('keeps an untagged movement in its own bucket rather than dropping it', async () => {
    const report = await statement({ grouping: 'article' });
    const operating = row(report, 'operating.in');
    // Settling an invoice carries no article on either line: the article was
    // on the accrual. Those movements must still be in the statement.
    expect(operating.breakdown.some((part) => part.articleId === null)).toBe(true);
  });

  it('leaves the breakdown empty when none was asked for', async () => {
    const report = await statement();
    expect(report.rows.every((line) => line.breakdown.length === 0)).toBe(true);
  });
});

describe('cash flow — tenancy and structure', () => {
  it('shows one tenant at a time (I8)', async () => {
    const mine = await statement();
    const [theirs] = await reports.getCashFlow({
      orgId: seeded.otherOrgId,
      from: FROM,
      to: TO,
    });
    expect(theirs).not.toBeUndefined();
    // The same generator runs for both, so a lost tenant filter would double.
    expect(theirs?.rows.map((line) => line.total.toStorage())).toEqual(
      mine.rows.map((line) => line.total.toStorage()),
    );
  });

  it('maps every account role to a section, so no movement is unclassified', () => {
    const mapped = Object.keys(SECTION_BY_CONTRA_ROLE).sort();
    expect(mapped).toEqual([...GL_ACCOUNT_ROLES].sort());
  });

  it('resolves drill-down roles from the structure, never from the caller', () => {
    expect([...contraRolesForCashFlowLine('financing.in')].sort()).toEqual(
      ['loan', 'owner_draw', 'retained_earnings', 'share_capital'].sort(),
    );
    expect(() => contraRolesForCashFlowLine('nope')).toThrow(/Not a cash-flow line/);
  });

  it('translates every label every report structure asks for, with none over', () => {
    const keys = declaredKeys([
      ...BALANCE_SHEET.map((spec) => spec.labelKey),
      ...PNL.map((spec) => spec.labelKey),
      ...CASH_FLOW.map((spec) => spec.labelKey),
    ]);
    const { missing, unused } = auditMessages(REPORT_MESSAGES, keys);
    expect(missing).toEqual([]);
    expect(unused).toEqual([]);
    expect(keys).toEqual([...REPORT_MESSAGE_KEYS].sort());
  });
});

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'cashflow.txt');

describe('golden file', () => {
  it('matches the checked-in statement for the seeded dataset', async () => {
    const report = await statement();
    const width = 18;
    const lines = [
      `CASH FLOW ${report.from} .. ${report.to} (${report.currency})`,
      '='.repeat(42 + width * report.periods.length),
      ['LINE'.padEnd(40), ...report.periods.map((p) => p.padStart(width))].join(''),
    ];
    for (const line of report.rows) {
      const label = `${'  '.repeat(line.level)}${line.labelKey}`.padEnd(40);
      const cells = line.amounts.map((amount) => amount.toStorage().padStart(width));
      lines.push([label, ...cells, line.total.toStorage().padStart(width + 4)].join(''));
    }
    const rendered = `${lines.join('\n')}\n`;

    if (process.env['UPDATE_GOLDEN'] === '1') {
      await writeFile(GOLDEN, rendered, 'utf8');
    }
    expect(rendered).toBe(await readFile(GOLDEN, 'utf8'));
  });
});
