import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './harness.js';
import { postRawEntry, seedOrg, type OrgFixture } from './fixtures.js';

let h: TestDatabase;
let acme: OrgFixture;
let other: OrgFixture;

beforeAll(async () => {
  h = await createTestDatabase();
  acme = await seedOrg(h.client, 'Acme');
  other = await seedOrg(h.client, 'Other');
}, 180_000);

afterAll(async () => {
  await h.close();
});

/** Runs `fn` in one transaction bound to `orgId`, as the schema owner role. */
function inOrg<T>(orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return h.client.begin(async (tx) => {
    await tx`select set_config('app.org_id', ${orgId}, true)`;
    return fn(tx);
  }) as unknown as Promise<T>;
}

async function errorCodeOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (error: unknown) {
    return (error as { code?: string }).code ?? 'NO_CODE';
  }
  throw new Error('expected the statement to be refused, but it succeeded');
}

describe('I1 — every entry balances in functional currency', () => {
  it('accepts a balanced entry', async () => {
    const id = await postRawEntry(h.client, acme, {
      accrualDate: '2026-01-15',
      lines: [
        { glAccountId: acme.cashGl, side: 'D', amount: '1200.0000' },
        { glAccountId: acme.revenueGl, side: 'C', amount: '1200.0000' },
      ],
    });
    const rows = await inOrg(
      acme.orgId,
      (tx) => tx`select count(*)::int as n from journal_line where entry_id = ${id}`,
    );
    expect(rows[0]).toEqual({ n: 2 });
  });

  it('rejects an unbalanced entry at COMMIT, not at INSERT (deferred trigger)', async () => {
    let insertsSucceeded = false;
    const code = await errorCodeOf(() =>
      h.client.begin(async (tx) => {
        await tx`select set_config('app.org_id', ${acme.orgId}, true)`;
        const entryId = randomUUID();
        await tx`
          insert into journal_entry (id, org_id, legal_entity_id, accrual_date, kind, source_type)
          values (${entryId}, ${acme.orgId}, ${acme.legalEntityId}, '2026-01-16', 'manual', 'test')`;
        await tx`
          insert into journal_line (org_id, entry_id, gl_account_id, side, amount, currency,
            fx_rate, amount_functional, source_type)
          values (${acme.orgId}, ${entryId}, ${acme.cashGl}, 'D', '100.0000', 'UZS',
            '1.0000000000', '100.0000', 'test')`;
        await tx`
          insert into journal_line (org_id, entry_id, gl_account_id, side, amount, currency,
            fx_rate, amount_functional, source_type)
          values (${acme.orgId}, ${entryId}, ${acme.revenueGl}, 'C', '99.0000', 'UZS',
            '1.0000000000', '99.0000', 'test')`;
        // Both inserts pass: the trigger is DEFERRABLE INITIALLY DEFERRED.
        insertsSucceeded = true;
      }),
    );
    expect(insertsSucceeded).toBe(true);
    expect(code).toBe('FI001');
  });

  it('rejects a single-legged entry', async () => {
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, {
        accrualDate: '2026-01-17',
        lines: [{ glAccountId: acme.cashGl, side: 'D', amount: '10.0000' }],
      }),
    );
    expect(code).toBe('FI001');
  });

  it('rejects an entry with no lines at all', async () => {
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, { accrualDate: '2026-01-18', lines: [] }),
    );
    expect(code).toBe('FI001');
  });

  it('rejects a rounding mismatch of one storage unit', async () => {
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, {
        accrualDate: '2026-01-19',
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: '100.0001' },
          { glAccountId: acme.revenueGl, side: 'C', amount: '100.0000' },
        ],
      }),
    );
    expect(code).toBe('FI001');
  });
});

describe('I2 — locked periods are closed to writes', () => {
  it('refuses an entry dated inside the locked period', async () => {
    await inOrg(
      acme.orgId,
      (tx) => tx`
        insert into period_lock (org_id, legal_entity_id, locked_through_date)
        values (${acme.orgId}, ${acme.legalEntityId}, '2026-02-28')
        on conflict (org_id, legal_entity_id) do update set locked_through_date = excluded.locked_through_date`,
    );

    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, {
        accrualDate: '2026-02-10',
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: '5.0000' },
          { glAccountId: acme.revenueGl, side: 'C', amount: '5.0000' },
        ],
      }),
    );
    expect(code).toBe('FI002');
  });

  it('refuses an entry dated exactly on the lock boundary', async () => {
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, {
        accrualDate: '2026-02-28',
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: '5.0000' },
          { glAccountId: acme.revenueGl, side: 'C', amount: '5.0000' },
        ],
      }),
    );
    expect(code).toBe('FI002');
  });

  it('still accepts entries in the open period after the lock', async () => {
    const id = await postRawEntry(h.client, acme, {
      accrualDate: '2026-03-01',
      lines: [
        { glAccountId: acme.cashGl, side: 'D', amount: '7.0000' },
        { glAccountId: acme.revenueGl, side: 'C', amount: '7.0000' },
      ],
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not leak one tenant lock onto another', async () => {
    const id = await postRawEntry(h.client, other, {
      accrualDate: '2026-02-10',
      lines: [
        { glAccountId: other.cashGl, side: 'D', amount: '5.0000' },
        { glAccountId: other.revenueGl, side: 'C', amount: '5.0000' },
      ],
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('I4 — the ledger is append-only', () => {
  let entryId: string;

  beforeAll(async () => {
    entryId = await postRawEntry(h.client, acme, {
      accrualDate: '2026-03-05',
      lines: [
        { glAccountId: acme.cashGl, side: 'D', amount: '42.0000' },
        { glAccountId: acme.revenueGl, side: 'C', amount: '42.0000' },
      ],
    });
  });

  it('refuses to edit a posted entry', async () => {
    const code = await errorCodeOf(() =>
      inOrg(
        acme.orgId,
        (tx) => tx`update journal_entry set description = 'oops' where id = ${entryId}`,
      ),
    );
    expect(code).toBe('FI004');
  });

  it('refuses to delete a posted entry', async () => {
    const code = await errorCodeOf(() =>
      inOrg(acme.orgId, (tx) => tx`delete from journal_entry where id = ${entryId}`),
    );
    expect(code).toBe('FI004');
  });

  it('refuses to edit or delete a line', async () => {
    const update = await errorCodeOf(() =>
      inOrg(
        acme.orgId,
        (tx) => tx`update journal_line set amount = '1.0000' where entry_id = ${entryId}`,
      ),
    );
    const remove = await errorCodeOf(() =>
      inOrg(acme.orgId, (tx) => tx`delete from journal_line where entry_id = ${entryId}`),
    );
    expect([update, remove]).toEqual(['FI004', 'FI004']);
  });

  it('permits exactly one transition: stamping reversed_by_id', async () => {
    const reversalId = await postRawEntry(h.client, acme, {
      accrualDate: '2026-03-06',
      kind: 'reversal',
      reversesId: entryId,
      reversalReason: 'wrong counterparty',
      lines: [
        { glAccountId: acme.cashGl, side: 'C', amount: '42.0000' },
        { glAccountId: acme.revenueGl, side: 'D', amount: '42.0000' },
      ],
    });
    // `reverses_id` is set at insert; a reversal without it fails the shape check.
    await inOrg(
      acme.orgId,
      (tx) => tx`update journal_entry set reversed_by_id = ${reversalId} where id = ${entryId}`,
    );

    const second = await errorCodeOf(() =>
      inOrg(
        acme.orgId,
        (tx) => tx`update journal_entry set reversed_by_id = ${reversalId} where id = ${entryId}`,
      ),
    );
    expect(second).toBe('FI004');
  });
});

describe('I8 — row level security isolates tenants', () => {
  it('hides another tenant rows from the app role', async () => {
    const own = await h.asOrg(acme.orgId, (tx) => tx`select count(*)::int as n from journal_entry`);
    const foreign = await h.asOrg(
      other.orgId,
      (tx) => tx`select count(*)::int as n from journal_entry where org_id = ${acme.orgId}`,
    );
    expect(Number((own as unknown as { n: number }[])[0]?.n)).toBeGreaterThan(0);
    expect(foreign).toEqual([{ n: 0 }]);
  });

  it('returns nothing at all when app.org_id is unset (fails closed)', async () => {
    const rows = await h.client.begin(async (tx) => {
      await tx.unsafe('set local role fincore_app');
      return tx`select count(*)::int as n from journal_entry`;
    });
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('refuses to write a row belonging to another tenant', async () => {
    const code = await errorCodeOf(() =>
      h.asOrg(
        other.orgId,
        (tx) => tx`
          insert into journal_entry (org_id, legal_entity_id, accrual_date, kind, source_type)
          values (${acme.orgId}, ${acme.legalEntityId}, '2026-04-01', 'manual', 'test')`,
      ),
    );
    // 42501 = new row violates row-level security policy.
    expect(code).toBe('42501');
  });

  it('refuses a line pointing at another tenant GL account', async () => {
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, other, {
        accrualDate: '2026-04-02',
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: '1.0000' },
          { glAccountId: other.revenueGl, side: 'C', amount: '1.0000' },
        ],
      }),
    );
    // Composite FK (gl_account_id, org_id) makes a cross-tenant reference impossible.
    expect(code).toBe('23503');
  });
});

describe('idempotency key', () => {
  it('is unique per organization and free across organizations', async () => {
    const key = `import-${randomUUID()}`;
    const lines = [
      { glAccountId: acme.cashGl, side: 'D' as const, amount: '3.0000' },
      { glAccountId: acme.revenueGl, side: 'C' as const, amount: '3.0000' },
    ];
    await postRawEntry(h.client, acme, {
      accrualDate: '2026-03-10',
      idempotencyKey: key,
      lines,
    });
    const code = await errorCodeOf(() =>
      postRawEntry(h.client, acme, { accrualDate: '2026-03-11', idempotencyKey: key, lines }),
    );
    expect(code).toBe('23505');

    const otherOrgId = await postRawEntry(h.client, other, {
      accrualDate: '2026-03-10',
      idempotencyKey: key,
      lines: [
        { glAccountId: other.cashGl, side: 'D', amount: '3.0000' },
        { glAccountId: other.revenueGl, side: 'C', amount: '3.0000' },
      ],
    });
    expect(otherOrgId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
