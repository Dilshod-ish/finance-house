import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createTestDatabase,
  seedOrg,
  type OrgFixture,
  type TestDatabase,
} from '@fincore/db/testing';
import { Money, addDays, currency, isoDate, type IsoDate } from '@fincore/shared';
import { createLedger, type Ledger, type PostEntryInput } from '../../src/index.js';

const UZS = currency('UZS');

let h: TestDatabase;
let ledger: Ledger;

beforeAll(async () => {
  h = await createTestDatabase();
  ledger = createLedger(h.db);
}, 180_000);

afterAll(async () => {
  await h.close();
});

/**
 * A posting shaped so it is always valid: two legs, equal amounts, opposite
 * sides. The properties below are about what the ledger does with *valid*
 * postings; invalid ones are the unit tests' job.
 */
interface Posting {
  readonly dayOffset: number;
  readonly units: number;
  readonly debitsCash: boolean;
}

const posting = fc.record({
  dayOffset: fc.integer({ min: 0, max: 60 }),
  // Whole minor units keep the generator honest about I7: amounts are strings.
  units: fc.integer({ min: 1, max: 5_000_000 }),
  debitsCash: fc.boolean(),
});

const START = isoDate('2027-01-01');

function amountOf(units: number): Money {
  // 1 unit = 0.0001 UZS, so the generator explores the storage scale itself.
  return Money.of((BigInt(units) * 1n).toString() + 'e-4', UZS);
}

function inputFor(fx: OrgFixture, p: Posting, index: number): PostEntryInput {
  const amount = amountOf(p.units);
  const accrualDate: IsoDate = addDays(START, p.dayOffset);
  const [debitGl, creditGl] = p.debitsCash ? [fx.cashGl, fx.revenueGl] : [fx.expenseGl, fx.cashGl];
  return {
    orgId: fx.orgId,
    legalEntityId: fx.legalEntityId,
    accrualDate,
    kind: 'manual',
    sourceType: 'property_test',
    description: `posting ${String(index)}`,
    lines: [
      { glAccountId: debitGl, side: 'D', amount },
      { glAccountId: creditGl, side: 'C', amount },
    ],
  };
}

async function postAll(fx: OrgFixture, postings: readonly Posting[]): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, p] of postings.entries()) {
    const result = await ledger.postEntry(inputFor(fx, p, index));
    if (!result.ok) {
      throw new Error(`valid posting was rejected: ${result.error.code}`);
    }
    ids.push(result.value.id);
  }
  return ids;
}

/** Signature of a trial balance: account -> balance, order-independent. */
async function balanceMap(orgId: string): Promise<Record<string, string>> {
  const rows = await ledger.getTrialBalance({ orgId });
  return Object.fromEntries(rows.map((r) => [r.code, r.balance.toStorage()]));
}

async function unbalancedEntryCount(orgId: string): Promise<number> {
  const rows = await h.asOrg(
    orgId,
    (tx) => tx<{ n: number }[]>`
      select count(*)::int as n from (
        select e.id
          from journal_entry e
          join journal_line l on l.entry_id = e.id
         group by e.id
        having sum(case when l.side = 'D' then l.amount_functional else -l.amount_functional end) <> 0
      ) bad`,
  );
  return rows[0]?.n ?? -1;
}

describe('ledger properties (CLAUDE.md §6)', () => {
  it('any sequence of valid postings leaves I1 intact', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(posting, { minLength: 1, maxLength: 6 }), async (postings) => {
        const fx = await seedOrg(h.client, 'P1');
        await postAll(fx, postings);
        expect(await unbalancedEntryCount(fx.orgId)).toBe(0);
      }),
      { numRuns: 15 },
    );
  }, 180_000);

  it('the trial balance always sums to zero', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(posting, { minLength: 1, maxLength: 6 }), async (postings) => {
        const fx = await seedOrg(h.client, 'P2');
        await postAll(fx, postings);
        const rows = await ledger.getTrialBalance({ orgId: fx.orgId });
        const total = rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(UZS));
        expect(total.toStorage()).toBe('0.0000');
      }),
      { numRuns: 15 },
    );
  }, 180_000);

  it('reversing an entry restores the prior trial balance exactly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(posting, { minLength: 1, maxLength: 4 }),
        posting,
        async (base, extra) => {
          const fx = await seedOrg(h.client, 'P3');
          await postAll(fx, base);
          const before = await balanceMap(fx.orgId);

          const posted = await ledger.postEntry(inputFor(fx, extra, 99));
          expect(posted.ok).toBe(true);
          if (!posted.ok) return;

          const reversal = await ledger.reverseEntry(fx.orgId, posted.value.id, 'property', null);
          expect(reversal.ok).toBe(true);

          // Every account that existed before is back to its prior balance, and
          // any account the extra posting touched is back to zero.
          const after = await balanceMap(fx.orgId);
          for (const [code, balance] of Object.entries(after)) {
            expect([code, balance]).toEqual([code, before[code] ?? '0.0000']);
          }
        },
      ),
      { numRuns: 12 },
    );
  }, 180_000);

  it('report totals are invariant under the order of posting', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(posting, { minLength: 2, maxLength: 6 }), async (postings) => {
        const forward = await seedOrg(h.client, 'P4a');
        const backward = await seedOrg(h.client, 'P4b');

        await postAll(forward, postings);
        await postAll(backward, [...postings].reverse());

        expect(await balanceMap(backward.orgId)).toEqual(await balanceMap(forward.orgId));
      }),
      { numRuns: 12 },
    );
  }, 180_000);
});
