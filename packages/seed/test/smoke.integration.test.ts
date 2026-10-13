import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '@fincore/db/testing';
import { createLedger, type Ledger } from '@fincore/ledger';
import { glAccountsByRole } from '@fincore/region-pack-contract';
import { uzRegionPack } from '@fincore/region-pack-uz';
import { CASH_ACCOUNT_KINDS, Money, currency, isoDate } from '@fincore/shared';
import { DEMO_WINDOW, rateOn, seedDemo, type SeedResult } from '../src/index.js';

let h: TestDatabase;
let ledger: Ledger;
let seeded: SeedResult;

const LOCAL = currency(uzRegionPack.currency.default);
const CASH_GL_CODES = glAccountsByRole(uzRegionPack, 'cash').map((a) => a.code);
const CASH_KINDS = [...CASH_ACCOUNT_KINDS];

beforeAll(async () => {
  h = await createTestDatabase();
  ledger = createLedger(h.db);
  seeded = await seedDemo(h.db);
}, 300_000);

afterAll(async () => {
  await h.close();
});

function sumBalances(rows: readonly { balance: Money }[]): string {
  return rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(LOCAL)).toStorage();
}

describe('seed', () => {
  it('produces the shape the bootstrap asked for', async () => {
    expect(seeded.journal.entryCount).toBeGreaterThanOrEqual(190);
    expect(seeded.journal.entryCount).toBeLessThanOrEqual(215);

    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<Record<string, number>[]>`
        select
          (select count(*)::int from legal_entity)                                as entities,
          (select count(*)::int from account)                                     as accounts,
          (select count(*)::int from journal_entry)                               as entries,
          (select count(distinct currency)::int from account)                     as currencies,
          (select count(distinct to_char(accrual_date, 'YYYY-MM'))::int
             from journal_entry)                                                  as months,
          (select count(*)::int from journal_entry where kind = 'fx_revaluation') as fx_revaluations,
          (select count(*)::int from journal_entry where kind = 'reversal')       as reversals`,
    );

    expect(rows[0]).toEqual({
      entities: 2,
      accounts: 4,
      entries: seeded.journal.entryCount,
      currencies: 2,
      months: 3,
      fx_revaluations: 1,
      reversals: 1,
    });
  });

  it('gives the two legal entities the forms and regimes the region pack defines', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ legal_form: string; tax_regime: string; vat_registered: boolean }[]>`
        select legal_form, tax_regime, vat_registered from legal_entity order by name`,
    );

    const forms = new Set(uzRegionPack.legalForms.map((f) => f.code));
    const regimes = new Set(uzRegionPack.taxRegimes.map((r) => r.code));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect([row.legal_form, forms.has(row.legal_form)]).toEqual([row.legal_form, true]);
      expect([row.tax_regime, regimes.has(row.tax_regime)]).toEqual([row.tax_regime, true]);
    }
    // One company on the VAT regime, one sole trader that is not VAT registered.
    expect(rows.map((r) => r.vat_registered).sort()).toEqual([false, true]);
  });
});

describe('smoke — the trial balance sums to zero', () => {
  it('across the whole organization', async () => {
    const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
    expect(rows.length).toBeGreaterThan(5);
    expect(sumBalances(rows)).toBe('0.0000');
  });

  it('for each legal entity on its own', async () => {
    for (const legalEntityId of [
      seeded.reference.companyEntityId,
      seeded.reference.soleTraderEntityId,
    ]) {
      const rows = await ledger.getTrialBalance({
        orgId: seeded.reference.orgId,
        legalEntityIds: [legalEntityId],
      });
      expect(rows.length).toBeGreaterThan(0);
      expect([legalEntityId, sumBalances(rows)]).toEqual([legalEntityId, '0.0000']);
    }
  });

  it('for every month in the window', async () => {
    const months = [
      [isoDate('2026-01-01'), isoDate('2026-01-31')],
      [isoDate('2026-02-01'), isoDate('2026-02-28')],
      [isoDate('2026-03-01'), isoDate('2026-03-31')],
    ] as const;
    for (const [from, to] of months) {
      const rows = await ledger.getTrialBalance({ orgId: seeded.reference.orgId, from, to });
      expect([from, sumBalances(rows)]).toEqual([from, '0.0000']);
    }
  });

  it('has no unbalanced entry at all (I1)', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ n: number }[]>`
        select count(*)::int as n from (
          select e.id from journal_entry e
            join journal_line l on l.entry_id = e.id
           group by e.id
          having sum(case when l.side = 'D' then l.amount_functional
                          else -l.amount_functional end) <> 0) unbalanced`,
    );
    expect(rows[0]).toEqual({ n: 0 });
  });
});

describe('smoke — cash per the ledger equals the sum of account balances', () => {
  it('reconciles the GL view against the account-dimension view (I5)', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ by_gl: string; by_account: string }[]>`
        select
          (select coalesce(sum(case when l.side = 'D' then l.amount_functional
                                    else -l.amount_functional end), 0)
             from journal_line l
             join gl_account g on g.id = l.gl_account_id
            where g.code = any(${CASH_GL_CODES}::text[]))    as by_gl,
          (select coalesce(sum(case when l.side = 'D' then l.amount_functional
                                    else -l.amount_functional end), 0)
             from journal_line l
             join account a on a.id = l.account_id
            where a.kind = any(${CASH_KINDS}::text[]))       as by_account`,
    );

    const byGl = Money.of(rows[0]?.by_gl ?? '0', LOCAL);
    const byAccount = Money.of(rows[0]?.by_account ?? '0', LOCAL);

    // Two independent aggregations of the same fact: one through the chart of
    // accounts, one through the account dimension. A line that hits a cash GL
    // without naming its money account — or the reverse — breaks this.
    expect(byGl.toStorage()).toBe(byAccount.toStorage());
    expect(byGl.isPositive()).toBe(true);
  });

  it('equals the sum of the four per-account balances', async () => {
    const perAccount = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ name: string; functional: string }[]>`
        select a.name,
               coalesce(sum(case when l.side = 'D' then l.amount_functional
                                 else -l.amount_functional end), 0) as functional
          from account a
          left join journal_line l on l.account_id = a.id
         group by a.id, a.name
         order by a.name`,
    );
    expect(perAccount).toHaveLength(4);

    const summed = perAccount.reduce(
      (acc, row) => acc.plus(Money.of(row.functional, LOCAL)),
      Money.zero(LOCAL),
    );

    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ value: string }[]>`
        select coalesce(sum(case when l.side = 'D' then l.amount_functional
                                 else -l.amount_functional end), 0) as value
          from journal_line l
          join gl_account g on g.id = l.gl_account_id
         where g.code = any(${CASH_GL_CODES}::text[])`,
    );

    expect(summed.toStorage()).toBe(Money.of(rows[0]?.value ?? '0', LOCAL).toStorage());
  });

  it('restates the foreign account at the closing rate (§5)', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ foreign_units: string; functional: string }[]>`
        select
          coalesce(sum(case when l.side = 'D' then l.amount else -l.amount end)
                   filter (where l.currency = a.currency), 0)      as foreign_units,
          coalesce(sum(case when l.side = 'D' then l.amount_functional
                            else -l.amount_functional end), 0)     as functional
          from journal_line l
          join account a on a.id = l.account_id
         where a.currency <> ${uzRegionPack.currency.default}`,
    );

    const held = Money.of(
      rows[0]?.foreign_units ?? '0',
      currency(seeded.reference.foreignCurrency),
    );
    const carried = Money.of(rows[0]?.functional ?? '0', LOCAL);

    expect(held.isPositive()).toBe(true);
    expect(carried.toStorage()).toBe(
      held.convert(rateOn(DEMO_WINDOW, DEMO_WINDOW.to), LOCAL).round().toStorage(),
    );
  });
});

describe('smoke — RLS blocks cross-org reads', () => {
  it('shows the neighbour tenant nothing of the demo organization', async () => {
    const demoOrgId = seeded.reference.orgId;
    const rows = await h.asOrg(
      seeded.otherOrgId,
      (tx) => tx<Record<string, number>[]>`
        select
          (select count(*)::int from journal_entry where org_id = ${demoOrgId}) as entries,
          (select count(*)::int from journal_line  where org_id = ${demoOrgId}) as lines,
          (select count(*)::int from account       where org_id = ${demoOrgId}) as accounts,
          (select count(*)::int from legal_entity  where org_id = ${demoOrgId}) as entities,
          (select count(*)::int from fx_rate       where org_id = ${demoOrgId}) as rates,
          (select count(*)::int from organization  where id     = ${demoOrgId}) as orgs`,
    );

    expect(rows[0]).toEqual({
      entries: 0,
      lines: 0,
      accounts: 0,
      entities: 0,
      rates: 0,
      orgs: 0,
    });
  });

  it('still shows the neighbour its own books', async () => {
    const rows = await h.asOrg(
      seeded.otherOrgId,
      (tx) => tx<{ n: number }[]>`select count(*)::int as n from journal_entry`,
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(100);
  });

  it('keeps the two trial balances disjoint, each summing to zero', async () => {
    const demo = await ledger.getTrialBalance({ orgId: seeded.reference.orgId });
    const other = await ledger.getTrialBalance({ orgId: seeded.otherOrgId });

    const demoIds = new Set(demo.map((r) => r.glAccountId));
    for (const row of other) {
      expect([row.glAccountId, demoIds.has(row.glAccountId)]).toEqual([row.glAccountId, false]);
    }
    expect(sumBalances(demo)).toBe('0.0000');
    expect(sumBalances(other)).toBe('0.0000');
  });

  it('returns nothing when no tenant is bound (fails closed)', async () => {
    const rows = await h.client.begin(async (tx) => {
      await tx.unsafe('set local role fincore_app');
      return tx`select count(*)::int as n from journal_entry`;
    });
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe('smoke — the reversal cancels its original exactly (I4)', () => {
  it('nets the reversed pair to zero on every account it touched', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ gl_account_id: string; net: string }[]>`
        select l.gl_account_id,
               sum(case when l.side = 'D' then l.amount_functional
                        else -l.amount_functional end) as net
          from journal_line l
         where l.entry_id in (
           ${seeded.journal.reversedEntryId}, ${seeded.journal.reversalEntryId})
         group by l.gl_account_id`,
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect([row.gl_account_id, row.net]).toEqual([row.gl_account_id, '0.0000']);
    }
  });

  it('links the original to its reversal in both directions', async () => {
    const rows = await h.asOrg(
      seeded.reference.orgId,
      (tx) => tx<{ reversed_by: string; reverses: string; reason: string }[]>`
        select
          (select reversed_by_id from journal_entry
            where id = ${seeded.journal.reversedEntryId}) as reversed_by,
          (select reverses_id from journal_entry
            where id = ${seeded.journal.reversalEntryId}) as reverses,
          (select reversal_reason from journal_entry
            where id = ${seeded.journal.reversalEntryId}) as reason`,
    );

    expect(rows[0]).toEqual({
      reversed_by: seeded.journal.reversalEntryId,
      reverses: seeded.journal.reversedEntryId,
      reason: 'duplicate supplier invoice',
    });
  });
});

/**
 * Hashes the financial content, deliberately excluding surrogate keys: what has
 * to be reproducible is every date, side, amount and rate — not the UUIDs
 * Postgres generates.
 */
async function contentDigest(db: TestDatabase, orgId: string): Promise<string> {
  const rows = await db.asOrg(
    orgId,
    (tx) => tx<Record<string, unknown>[]>`
      select e.accrual_date, e.cash_date, e.kind, e.source_type, e.description,
             l.side, l.amount, l.currency, l.fx_rate, l.amount_functional,
             g.code as gl_code, coalesce(a.name, '') as account_name
        from journal_entry e
        join journal_line l on l.entry_id = e.id
        join gl_account g on g.id = l.gl_account_id
        left join account a on a.id = l.account_id
       order by e.accrual_date, e.kind, e.description, l.side, g.code, l.amount_functional`,
  );

  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(
      Object.values(row)
        .map((value) => String(value))
        .join('|'),
    );
    hash.update('\n');
  }
  return `${String(rows.length)}:${hash.digest('hex')}`;
}

describe('smoke — the seed is deterministic', () => {
  it('produces identical financial content in a second, independent database', async () => {
    const second = await createTestDatabase();
    try {
      await seedDemo(second.db);
      const first = await contentDigest(h, seeded.reference.orgId);
      const repeat = await contentDigest(second, seeded.reference.orgId);
      expect(repeat).toBe(first);
      expect(first).not.toMatch(/^0:/);
    } finally {
      await second.close();
    }
  }, 300_000);
});
