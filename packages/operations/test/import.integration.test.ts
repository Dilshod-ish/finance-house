import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import { createLedger, type Ledger } from '@fincore/ledger';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { createReports, type Reports } from '@fincore/reports';
import { seedDemo, type SeedResult } from '@fincore/seed';
import { Money, currency, isoDate } from '@fincore/shared';
import { createOperations, type Operations } from '../src/index.js';
import { statementBytes, type StatementRow } from './statement-file.js';

const UZS = currency('UZS');
const ACCOUNT = 'Company current account';
/*
 * The name a person would type for an article the demo seed really creates.
 * Taken from the pack rather than written out: the pack decides which language
 * an organization's reference data is created in — for `uz` that is Russian,
 * not Uzbek — and a literal here would quietly stop matching.
 */
const ARTICLE =
  uzRegionPack.messages[uzRegionPack.locale.defaultLanguage]['article.svc.revenue.projects'] ?? '';

let h: TestDatabase;
let operations: Operations;
let ledger: Ledger;
let reports: Reports;
let seeded: SeedResult;

beforeAll(async () => {
  h = await createTestDatabase();
  operations = createOperations(h.db);
  ledger = createLedger(h.db);
  reports = createReports(h.db);
  seeded = await seedDemo(h.db);
}, 300_000);

afterAll(async () => {
  await h.close();
});

const file = (rows: readonly StatementRow[], over: { closing?: string } = {}) => ({
  accountName: ACCOUNT,
  currency: 'UZS',
  from: '2026-04-01',
  to: '2026-04-30',
  opening: '0,00',
  closing: over.closing ?? '0,00',
  rows,
});

/** Trial balance as a map, so a before/after comparison is order-free. */
async function balances(): Promise<Record<string, string>> {
  const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
  return Object.fromEntries(rows.map((row) => [row.code, row.balance.toStorage()]));
}

async function suspenseBalance(): Promise<string> {
  const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
  return rows.find((row) => row.code === '1900')?.balance.toStorage() ?? '0.0000';
}

async function importBytes(bytes: Uint8Array, fileName: string) {
  return operations.importBankStatement({
    orgId: seeded.reference.orgId,
    pack: uzRegionPack,
    fileName,
    bytes,
  });
}

async function importFile(
  rows: readonly StatementRow[],
  fileName: string,
  over: { closing?: string } = {},
) {
  return importBytes(await statementBytes(file(rows, over)), fileName);
}

/*
 * The bytes of the first import, kept so the "same file twice" case really
 * sends the same bytes. Rebuilding the workbook does not reproduce them:
 * exceljs writes a zip whose entries carry timestamps, so two builds of
 * identical content differ. A person re-uploading a file does not have that
 * problem, but a test that rebuilds would be testing the wrong thing.
 */
let aprilBytes: Uint8Array;

describe('importBankStatement', () => {
  it('posts an unclassified row against the suspense account, and a classified one against its article', async () => {
    const before = await balances();

    aprilBytes = await statementBytes(
      file(
        [
          {
            date: '2026-04-03',
            documentNumber: 'A-1',
            receipt: '1 200 000,00',
            counterparty: 'Northwind Ltd',
            purpose: 'April delivery',
            article: ARTICLE,
          },
          {
            date: '2026-04-07',
            documentNumber: 'A-2',
            receipt: '300 000,00',
            counterparty: 'Northwind Ltd',
            purpose: 'unidentified transfer',
          },
        ],
        { closing: '1 500 000,00' },
      ),
    );
    const result = await importBytes(aprilBytes, 'april.xlsx');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.posted).toHaveLength(2);
    expect(result.value.duplicates).toEqual([]);
    expect(result.value.unassignedCount).toBe(1);
    expect(result.value.unknownArticles).toEqual([]);

    // The classified row went to its article's account, the other to 1900.
    expect(await suspenseBalance()).toBe('-300000.0000');

    const after = await balances();
    const cash = Money.of(after['1010'] ?? '0', UZS).minus(Money.of(before['1010'] ?? '0', UZS));
    expect(cash.toStorage()).toBe('1500000.0000');

    // I1 still holds across the whole ledger.
    const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
    const total = rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(UZS));
    expect(total.toStorage()).toBe('0.0000');
  });

  it('shows the unclassified money in its own cash-flow section, inside the net flow', async () => {
    const [statement] = await reports.getCashFlow({
      orgId: seeded.reference.orgId,
      from: isoDate('2026-04-01'),
      to: isoDate('2026-04-30'),
    });
    expect(statement).toBeDefined();
    if (statement === undefined) return;

    const line = (code: string) =>
      statement.rows.find((row) => row.code === code)?.total.toStorage();

    expect(line('unassigned.in')).toBe('300000.0000');
    expect(line('unassigned.out')).toBe('0.0000');
    expect(line('operating.in')).toBe('1200000.0000');
    // The net flow carries both: the bank balance does not wait for the inbox.
    expect(line('netFlow')).toBe('1500000.0000');
  });

  it('reconciles the statement against the ledger cash balance', async () => {
    const [check] = await reports.reconcileCashFlow({
      orgId: seeded.reference.orgId,
      from: isoDate('2026-04-01'),
      to: isoDate('2026-04-30'),
    });
    expect(check?.residual.toStorage()).toBe('0.0000');
  });

  it('refuses the same bytes twice, whatever the file is called', async () => {
    const again = await importBytes(aprilBytes, 'april-again.xlsx');
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe('already_imported');
  });

  it('reports a row it has seen before and does not post it', async () => {
    const before = await balances();
    // Same account, date, amount and document number as A-2 above, in a file
    // whose bytes differ — the overlap a second statement for a longer period
    // always has.
    const result = await importFile(
      [
        {
          date: '2026-04-07',
          documentNumber: 'A-2',
          receipt: '300 000,00',
          counterparty: 'Northwind Ltd',
          purpose: 'unidentified transfer',
        },
        {
          date: '2026-04-20',
          documentNumber: 'A-9',
          payment: '50 000,00',
          counterparty: 'Meridian Bank',
          purpose: 'bank charge',
        },
      ],
      'overlap.xlsx',
      { closing: '250 000,00' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.duplicates).toHaveLength(1);
    expect(result.value.duplicates[0]?.documentNumber).toBe('A-2');
    expect(result.value.posted).toHaveLength(1);

    const after = await balances();
    const cash = Money.of(after['1010'] ?? '0', UZS).minus(Money.of(before['1010'] ?? '0', UZS));
    // Only the new row moved the balance: the duplicate was not posted twice.
    expect(cash.toStorage()).toBe('-50000.0000');
  });

  it('refuses a statement whose rows do not reach its closing balance', async () => {
    const result = await importFile(
      [{ date: '2026-05-04', documentNumber: 'B-1', receipt: '100 000,00', purpose: 'part' }],
      'truncated.xlsx',
      { closing: '999 999,00' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_file');
      expect(result.error.problems?.some((p) => p.message.uz.includes("to'liq emas"))).toBe(true);
    }
  });

  it('names an account it does not have instead of inventing one', async () => {
    const bytes = await statementBytes({
      ...file([{ date: '2026-05-05', receipt: '1,00', purpose: 'x' }], { closing: '1,00' }),
      accountName: 'Nowhere account',
    });
    const result = await operations.importBankStatement({
      orgId: seeded.reference.orgId,
      pack: uzRegionPack,
      fileName: 'nowhere.xlsx',
      bytes,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_account');
  });

  it('loads the file but says so when an article name is unknown', async () => {
    const result = await importFile(
      [
        {
          date: '2026-05-06',
          documentNumber: 'C-1',
          receipt: '70 000,00',
          purpose: 'typo in article',
          article: `${ARTICLE} (yo'q)`,
        },
      ],
      'typo.xlsx',
      { closing: '70 000,00' },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unknownArticles).toEqual([`${ARTICLE} (yo'q)`]);
    expect(result.value.unassignedCount).toBe(1);
  });
});

describe('listInbox', () => {
  it('lists exactly what is still waiting for an article', async () => {
    const inbox = await operations.listInbox(seeded.reference.orgId);
    const purposes = inbox.map((row) => row.purpose);
    expect(purposes).toContain('unidentified transfer');
    expect(purposes).toContain('bank charge');
    expect(purposes).not.toContain('April delivery');
  });
});

describe('assignArticle', () => {
  it('moves the money off the suspense account by reversing and re-posting', async () => {
    const inbox = await operations.listInbox(seeded.reference.orgId);
    const target = inbox.find((row) => row.purpose === 'unidentified transfer');
    expect(target).toBeDefined();
    if (target === undefined) return;

    const articleId = seeded.reference.articlesByFlowType
      .get('revenue')
      ?.find((candidate) => candidate.key.endsWith('revenue.projects'))?.id;
    expect(articleId).toBeDefined();
    if (articleId === undefined) return;

    const suspenseBefore = await suspenseBalance();
    const result = await operations.assignArticle({
      orgId: seeded.reference.orgId,
      pack: uzRegionPack,
      operationId: target.id,
      articleId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entryId).not.toBe(result.value.reversedEntryId);

    // 300 000 left the suspense account; cash did not move at all.
    const moved = Money.of(await suspenseBalance(), UZS).minus(Money.of(suspenseBefore, UZS));
    expect(moved.toStorage()).toBe('300000.0000');

    const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
    const total = rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(UZS));
    expect(total.toStorage()).toBe('0.0000');

    const inboxAfter = await operations.listInbox(seeded.reference.orgId);
    expect(inboxAfter.map((row) => row.id)).not.toContain(target.id);
  });

  it('refuses an operation it cannot find', async () => {
    const result = await operations.assignArticle({
      orgId: seeded.reference.orgId,
      pack: uzRegionPack,
      operationId: '7c1d3a90-0000-4000-8000-0000000000ff',
      articleId: '7c1d3a90-0000-4000-8000-0000000000fe',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_operation');
  });
});

describe('revertBatch', () => {
  it('puts the ledger back exactly where it was, by reversal', async () => {
    const before = await balances();
    const imported = await importFile(
      [
        {
          date: '2026-06-02',
          documentNumber: 'D-1',
          receipt: '440 000,00',
          purpose: 'to be undone',
        },
        { date: '2026-06-03', documentNumber: 'D-2', payment: '40 000,00', purpose: 'and this' },
      ],
      'undo-me.xlsx',
      { closing: '400 000,00' },
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const reverted = await operations.revertBatch({
      orgId: seeded.reference.orgId,
      batchId: imported.value.batchId,
      reason: 'wrong file',
    });
    expect(reverted.ok).toBe(true);
    if (!reverted.ok) return;
    expect(reverted.value.reversedEntryIds).toHaveLength(2);

    const after = await balances();
    for (const code of new Set([...Object.keys(before), ...Object.keys(after)])) {
      expect([code, after[code] ?? '0.0000']).toEqual([code, before[code] ?? '0.0000']);
    }

    // Nothing was deleted: the operations stay as a record of the upload.
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ n: number }[]>`
        select count(*)::int as n from cash_operation
         where import_batch_id = ${imported.value.batchId}`,
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('refuses to revert twice', async () => {
    const imported = await importFile(
      [{ date: '2026-06-10', documentNumber: 'E-1', receipt: '10 000,00', purpose: 'once' }],
      'twice.xlsx',
      { closing: '10 000,00' },
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const first = await operations.revertBatch({
      orgId: seeded.reference.orgId,
      batchId: imported.value.batchId,
      reason: 'first',
    });
    expect(first.ok).toBe(true);

    const second = await operations.revertBatch({
      orgId: seeded.reference.orgId,
      batchId: imported.value.batchId,
      reason: 'second',
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('batch_already_reverted');
  });

  it('lets the same file be imported again once its batch is reverted', async () => {
    const rows: StatementRow[] = [
      { date: '2026-06-20', documentNumber: 'F-1', receipt: '5 000,00', purpose: 'redo' },
    ];
    const first = await importFile(rows, 'redo.xlsx', { closing: '5 000,00' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await operations.revertBatch({
      orgId: seeded.reference.orgId,
      batchId: first.value.batchId,
      reason: 'mistake',
    });

    // The file hash is free again — but the row itself is still a duplicate of
    // the one the reverted batch recorded, so it is reported, not posted.
    const second = await importFile(rows, 'redo.xlsx', { closing: '5 000,00' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.duplicates).toHaveLength(1);
  });

  it('refuses an unknown batch', async () => {
    const result = await operations.revertBatch({
      orgId: seeded.reference.orgId,
      batchId: '7c1d3a90-0000-4000-8000-0000000000aa',
      reason: 'x',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('unknown_batch');
  });
});

describe('listBatches', () => {
  it('reports what each upload did, newest first', async () => {
    const batches = await operations.listBatches(seeded.reference.orgId);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(
      batches[1]?.createdAt.getTime() ?? 0,
    );
    expect(batches.some((batch) => batch.status === 'reverted')).toBe(true);
    expect(batches.every((batch) => batch.accountName === ACCOUNT)).toBe(true);
  });
});
