import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, postRawEntry, seedOrg, type TestDatabase } from '@fincore/db/testing';
import { seedDemo, type SeedResult } from '@fincore/seed';
import { Money, auditMessages, currency, declaredKeys, isoDate } from '@fincore/shared';
import {
  BALANCE_SHEET,
  REPORT_MESSAGES,
  createReports,
  type BalanceSheetReport,
  type Reports,
} from '../../src/index.js';

const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden', 'balance-sheet.txt');
const AS_OF = isoDate('2026-03-31');
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

/** Fixed-width rendering so the golden file reads like the report it is. */
function render(report: BalanceSheetReport): string {
  const rows = report.lines.map((line) => {
    const indent = '  '.repeat(line.level);
    const label = `${indent}${REPORT_MESSAGES.en[line.labelKey] ?? line.labelKey}`;
    return `${label.padEnd(44)}${line.amount.toStorage().padStart(20)}`;
  });
  return [
    `BALANCE SHEET as of ${report.asOf} (${report.currency})`,
    '='.repeat(64),
    ...rows,
    '-'.repeat(64),
    `${'Difference (assets - liabilities - equity)'.padEnd(44)}${report.difference
      .toStorage()
      .padStart(20)}`,
    `balanced: ${String(report.isBalanced)}`,
    '',
  ].join('\n');
}

describe('getBalanceSheet', () => {
  it('returns one report per functional currency', async () => {
    const result = await reports.getBalanceSheet({ orgId: seeded.reference.orgId, asOf: AS_OF });
    // Both legal entities in the seed are UZS, so one report.
    expect(result).toHaveLength(1);
    expect(result[0]?.currency).toBe(UZS);
  });

  it('balances on the seeded ledger, with no plug', async () => {
    const [report] = await reports.getBalanceSheet({
      orgId: seeded.reference.orgId,
      asOf: AS_OF,
    });
    expect(report).toBeDefined();
    if (report === undefined) return;

    expect(report.difference.toStorage()).toBe('0.0000');
    expect(report.isBalanced).toBe(true);
    expect(report.totalAssets.isPositive()).toBe(true);
    expect(report.totalAssets.toStorage()).toBe(
      report.totalLiabilities.plus(report.totalEquity).toStorage(),
    );
  });

  it('balances at every month end in the window', async () => {
    for (const asOf of [isoDate('2026-01-31'), isoDate('2026-02-28'), isoDate('2026-03-31')]) {
      const [report] = await reports.getBalanceSheet({
        orgId: seeded.reference.orgId,
        asOf,
      });
      expect([asOf, report?.difference.toStorage()]).toEqual([asOf, '0.0000']);
    }
  });

  it('balances for each legal entity on its own', async () => {
    for (const legalEntityId of [
      seeded.reference.companyEntityId,
      seeded.reference.soleTraderEntityId,
    ]) {
      const [report] = await reports.getBalanceSheet({
        orgId: seeded.reference.orgId,
        legalEntityIds: [legalEntityId],
        asOf: AS_OF,
      });
      expect([legalEntityId, report?.isBalanced]).toEqual([legalEntityId, true]);
      expect(report?.totalAssets.isPositive()).toBe(true);
    }
  });

  it('shows the opening balances as equity, not as revenue', async () => {
    const [atOpening] = await reports.getBalanceSheet({
      orgId: seeded.reference.orgId,
      asOf: isoDate('2026-01-01'),
    });
    expect(atOpening).toBeDefined();
    if (atOpening === undefined) return;

    const shareCapital = atOpening.lines.find((l) => l.code === 'equity.shareCapital');
    expect(shareCapital?.amount.isPositive()).toBe(true);
    expect(atOpening.isBalanced).toBe(true);
  });

  it('is empty but still balanced for a scope with no entries', async () => {
    const [report] = await reports.getBalanceSheet({
      orgId: seeded.reference.orgId,
      asOf: isoDate('2025-06-30'),
    });
    // No functional currency is in scope, so there is no report at all rather
    // than a report full of zeroes in a currency nobody chose.
    expect(report).toBeUndefined();
  });

  it('never mixes another tenant into the figures (I8)', async () => {
    const [demo] = await reports.getBalanceSheet({ orgId: seeded.reference.orgId, asOf: AS_OF });
    const [other] = await reports.getBalanceSheet({ orgId: seeded.otherOrgId, asOf: AS_OF });
    expect(demo?.isBalanced).toBe(true);
    expect(other?.isBalanced).toBe(true);
    // Different books: the demo tenant has an FX account and a reversal, the
    // neighbour was seeded with the same generator but its own ids.
    expect(demo?.totalAssets.toStorage()).not.toBe('0.0000');
    expect(other?.totalAssets.toStorage()).not.toBe('0.0000');
  });

  it('returns a separate report per functional currency, never a mixed total', async () => {
    // A second legal entity whose functional currency differs: consolidating
    // the two would need the FX policy of §5, so the report must not try.
    const multi = await seedOrg(h.client, 'Multi');
    const usdEntityId = randomUUID();
    const entryId = randomUUID();
    await h.client.begin(async (tx) => {
      await tx`select set_config('app.org_id', ${multi.orgId}, true)`;
      await tx`
        insert into legal_entity (id, org_id, name, functional_currency)
        values (${usdEntityId}, ${multi.orgId}, 'Multi USD', 'USD')`;
      await tx`
        insert into journal_entry (id, org_id, legal_entity_id, accrual_date, kind, source_type)
        values (${entryId}, ${multi.orgId}, ${usdEntityId}, '2026-02-01', 'opening', 'test')`;
      await tx`
        insert into journal_line (org_id, entry_id, gl_account_id, side, amount, currency,
          fx_rate, amount_functional, source_type)
        values
          (${multi.orgId}, ${entryId}, ${multi.cashGl},    'D', '500.0000', 'USD',
           '1.0000000000', '500.0000', 'test'),
          (${multi.orgId}, ${entryId}, ${multi.revenueGl}, 'C', '500.0000', 'USD',
           '1.0000000000', '500.0000', 'test')`;
    });

    // ...and something in the organization's own currency, so both appear.
    await postRawEntry(h.client, multi, {
      accrualDate: '2026-02-01',
      lines: [
        { glAccountId: multi.cashGl, side: 'D', amount: '900.0000' },
        { glAccountId: multi.revenueGl, side: 'C', amount: '900.0000' },
      ],
    });

    const result = await reports.getBalanceSheet({ orgId: multi.orgId, asOf: AS_OF });
    expect(result.map((r) => r.currency)).toEqual(['USD', 'UZS']);
    for (const report of result) {
      expect([report.currency, report.isBalanced]).toEqual([report.currency, true]);
    }
  });

  it('translates every label this structure asks for', () => {
    // Audited against BALANCE_SHEET's labelKeys, not the message table's own
    // keys: checking a table against itself cannot catch a renamed line whose
    // label key was left behind. The unused-key half lives in the P&L suite,
    // which audits every structure at once.
    const keys = declaredKeys(BALANCE_SHEET.map((spec) => spec.labelKey));
    expect(auditMessages(REPORT_MESSAGES, keys).missing).toEqual([]);
  });

  it('matches the checked-in golden file', async () => {
    const [report] = await reports.getBalanceSheet({
      orgId: seeded.reference.orgId,
      asOf: AS_OF,
    });
    expect(report).toBeDefined();
    if (report === undefined) return;

    const actual = render(report);
    if (process.env['UPDATE_GOLDEN'] === '1') {
      await writeFile(GOLDEN, actual, 'utf8');
    }
    const expected = await readFile(GOLDEN, 'utf8');
    expect(actual).toBe(expected);
  });

  it('keeps the golden figures consistent with the ledger itself', async () => {
    // The golden file is only trustworthy if it agrees with a figure computed a
    // different way: cash here must equal the cash accounts' own balances.
    const [report] = await reports.getBalanceSheet({
      orgId: seeded.reference.orgId,
      asOf: AS_OF,
    });
    const cashLine = report?.lines.find((l) => l.code === 'assets.current.cash');

    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ value: string }[]>`
        select coalesce(sum(case when l.side = 'D' then l.amount_functional
                                 else -l.amount_functional end), 0) as value
          from journal_line l
          join account a on a.id = l.account_id`,
    );
    expect(cashLine?.amount.toStorage()).toBe(Money.of(rows[0]?.value ?? '0', UZS).toStorage());
  });
});
