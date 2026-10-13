import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  seedOrg,
  type OrgFixture,
  type TestDatabase,
} from '@fincore/db/testing';
import { Money, currency, isoDate } from '@fincore/shared';
import { createLedger, type Ledger, type PostEntryInput } from '../../src/index.js';

const UZS = currency('UZS');
const USD = currency('USD');

let h: TestDatabase;
let ledger: Ledger;
let acme: OrgFixture;
let other: OrgFixture;

beforeAll(async () => {
  h = await createTestDatabase();
  ledger = createLedger(h.db);
  acme = await seedOrg(h.client, 'Acme');
  other = await seedOrg(h.client, 'Other');
}, 180_000);

afterAll(async () => {
  await h.close();
});

function sale(over: Partial<PostEntryInput> = {}, fx: OrgFixture = acme): PostEntryInput {
  return {
    orgId: fx.orgId,
    legalEntityId: fx.legalEntityId,
    accrualDate: isoDate('2026-06-01'),
    kind: 'cash',
    sourceType: 'bank_statement',
    lines: [
      { glAccountId: fx.cashGl, side: 'D', amount: Money.of('1000', UZS), accountId: fx.accountId },
      { glAccountId: fx.revenueGl, side: 'C', amount: Money.of('1000', UZS) },
    ],
    ...over,
  };
}

async function countEntries(orgId: string): Promise<number> {
  const rows = await h.asOrg(
    orgId,
    (tx) => tx<{ n: number }[]>`select count(*)::int as n from journal_entry`,
  );
  return rows[0]?.n ?? -1;
}

describe('postEntry', () => {
  it('writes a balanced entry with its lines', async () => {
    const result = await ledger.postEntry(sale({ cashDate: isoDate('2026-06-01') }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.deduplicated).toBe(false);
    expect(result.value.kind).toBe('cash');
    expect(result.value.cashDate).toBe('2026-06-01');
    expect(result.value.accrualDate).toBe('2026-06-01');
    expect(result.value.reversedById).toBeNull();

    const lines = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ side: string; amount_functional: string; source_type: string }[]>`
        select side, amount_functional, source_type from journal_line
         where entry_id = ${result.value.id} order by side`,
    );
    expect(lines).toEqual([
      { side: 'C', amount_functional: '1000.0000', source_type: 'bank_statement' },
      { side: 'D', amount_functional: '1000.0000', source_type: 'bank_statement' },
    ]);
  });

  it('converts a foreign-currency line at the given rate', async () => {
    const result = await ledger.postEntry(
      sale({
        accrualDate: isoDate('2026-06-02'),
        lines: [
          {
            glAccountId: acme.cashGl,
            side: 'D',
            amount: Money.of('100', USD),
            fxRate: '12650.5000000000',
          },
          { glAccountId: acme.revenueGl, side: 'C', amount: Money.of('1265050', UZS) },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const lines = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ currency: string; amount: string; amount_functional: string }[]>`
        select currency, amount, amount_functional from journal_line
         where entry_id = ${result.value.id} and side = 'D'`,
    );
    expect(lines[0]).toEqual({
      currency: 'USD',
      amount: '100.0000',
      amount_functional: '1265050.0000',
    });
  });

  it('returns a typed error and writes nothing when the entry does not balance', async () => {
    const before = await countEntries(acme.orgId);
    const result = await ledger.postEntry(
      sale({
        accrualDate: isoDate('2026-06-03'),
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: Money.of('10', UZS) },
          { glAccountId: acme.revenueGl, side: 'C', amount: Money.of('9', UZS) },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNBALANCED');
    expect(await countEntries(acme.orgId)).toBe(before);
  });

  it('reports an unknown legal entity instead of throwing', async () => {
    const result = await ledger.postEntry(sale({ legalEntityId: randomUUID() }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('LEGAL_ENTITY_NOT_FOUND');
  });

  it('refuses a locked period with a typed error, not a throw (I2)', async () => {
    await h.asOrg(
      other.orgId,
      (tx) => tx`
        insert into period_lock (org_id, legal_entity_id, locked_through_date)
        values (${other.orgId}, ${other.legalEntityId}, '2026-06-30')`,
    );
    const result = await ledger.postEntry(sale({ accrualDate: isoDate('2026-06-15') }, other));
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'PERIOD_LOCKED') {
      expect(result.error.lockedThrough).toBe('2026-06-30');
      expect(result.error.attemptedDate).toBe('2026-06-15');
      expect(result.error.legalEntityId).toBe(other.legalEntityId);
    }
  });

  it('still posts to an open period for the same entity', async () => {
    const result = await ledger.postEntry(sale({ accrualDate: isoDate('2026-07-01') }, other));
    expect(result.ok).toBe(true);
  });
});

describe('postEntry — idempotency', () => {
  it('returns the first entry when the same key is replayed', async () => {
    const idempotencyKey = `stmt-${randomUUID()}`;
    const input = sale({ accrualDate: isoDate('2026-06-04'), idempotencyKey });

    const first = await ledger.postEntry(input);
    const second = await ledger.postEntry(input);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(second.value.id).toBe(first.value.id);
    expect(first.value.deduplicated).toBe(false);
    expect(second.value.deduplicated).toBe(true);

    const rows = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ n: number }[]>`
        select count(*)::int as n from journal_entry where idempotency_key = ${idempotencyKey}`,
    );
    expect(rows[0]).toEqual({ n: 1 });
  });

  it('replays even when the second call carries different content', async () => {
    const idempotencyKey = `stmt-${randomUUID()}`;
    const first = await ledger.postEntry(
      sale({ accrualDate: isoDate('2026-06-05'), idempotencyKey }),
    );
    const second = await ledger.postEntry(
      sale({
        accrualDate: isoDate('2026-06-06'),
        idempotencyKey,
        lines: [
          { glAccountId: acme.cashGl, side: 'D', amount: Money.of('7', UZS) },
          { glAccountId: acme.revenueGl, side: 'C', amount: Money.of('7', UZS) },
        ],
      }),
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.id).toBe(first.value.id);
    expect(second.value.accrualDate).toBe('2026-06-05');
  });

  it('treats two keyless calls as two distinct entries', async () => {
    const a = await ledger.postEntry(sale({ accrualDate: isoDate('2026-06-07') }));
    const b = await ledger.postEntry(sale({ accrualDate: isoDate('2026-06-07') }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.id).not.toBe(b.value.id);
  });

  it('keeps the same key usable in another organization', async () => {
    const idempotencyKey = `shared-${randomUUID()}`;
    const a = await ledger.postEntry(sale({ accrualDate: isoDate('2026-07-02'), idempotencyKey }));
    const b = await ledger.postEntry(
      sale({ accrualDate: isoDate('2026-07-02'), idempotencyKey }, other),
    );
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.id).not.toBe(b.value.id);
  });
});

describe('reverseEntry', () => {
  it('mirrors every line onto the other side and links both directions', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-08-01') }));
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;

    const reversal = await ledger.reverseEntry(
      acme.orgId,
      posted.value.id,
      'duplicate import',
      null,
    );
    expect(reversal.ok).toBe(true);
    if (!reversal.ok) return;

    expect(reversal.value.kind).toBe('reversal');
    expect(reversal.value.reversesId).toBe(posted.value.id);
    expect(reversal.value.reversalReason).toBe('duplicate import');
    // No surrogate key in prose: the link is reverses_id, the why is the reason.
    expect(reversal.value.description).toBeNull();
    expect(reversal.value.accrualDate).toBe('2026-08-01');

    const rows = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ reversed_by_id: string }[]>`
        select reversed_by_id from journal_entry where id = ${posted.value.id}`,
    );
    expect(rows[0]?.reversed_by_id).toBe(reversal.value.id);

    const lines = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ side: string; amount_functional: string; account_id: string | null }[]>`
        select side, amount_functional, account_id from journal_line
         where entry_id = ${reversal.value.id} order by side`,
    );
    expect(lines).toEqual([
      { side: 'C', amount_functional: '1000.0000', account_id: acme.accountId },
      { side: 'D', amount_functional: '1000.0000', account_id: null },
    ]);
  });

  it('refuses an unknown entry', async () => {
    const result = await ledger.reverseEntry(acme.orgId, randomUUID(), 'x', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ENTRY_NOT_FOUND');
  });

  it('refuses an entry that belongs to another tenant', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-08-02') }));
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    const result = await ledger.reverseEntry(other.orgId, posted.value.id, 'x', null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ENTRY_NOT_FOUND');
  });

  it('refuses to reverse twice', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-08-03') }));
    if (!posted.ok) throw new Error('setup failed');
    const first = await ledger.reverseEntry(acme.orgId, posted.value.id, 'once', null);
    expect(first.ok).toBe(true);
    const second = await ledger.reverseEntry(acme.orgId, posted.value.id, 'twice', null);
    expect(second.ok).toBe(false);
    if (!second.ok && second.error.code === 'ALREADY_REVERSED') {
      expect(second.error.entryId).toBe(posted.value.id);
    }
  });

  it('refuses to write the reversal into a locked period, and takes an open date instead', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-09-01') }));
    if (!posted.ok) throw new Error('setup failed');

    await h.asOrg(
      acme.orgId,
      (tx) => tx`
        insert into period_lock (org_id, legal_entity_id, locked_through_date)
        values (${acme.orgId}, ${acme.legalEntityId}, '2026-09-30')
        on conflict (org_id, legal_entity_id)
          do update set locked_through_date = excluded.locked_through_date`,
    );

    const blocked = await ledger.reverseEntry(acme.orgId, posted.value.id, 'late fix', null);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok && blocked.error.code === 'PERIOD_LOCKED') {
      expect(blocked.error.lockedThrough).toBe('2026-09-30');
    }

    const allowed = await ledger.reverseEntry(acme.orgId, posted.value.id, 'late fix', null, {
      accrualDate: isoDate('2026-10-01'),
      idempotencyKey: `rev-${randomUUID()}`,
      description: 'Posted to the wrong period',
    });
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.value.accrualDate).toBe('2026-10-01');
      expect(allowed.value.idempotencyKey).not.toBeNull();
      expect(allowed.value.description).toBe('Posted to the wrong period');
    }
  });

  it('records the actor who reversed', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-10-05') }));
    if (!posted.ok) throw new Error('setup failed');
    const actor = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ id: string }[]>`
        insert into app_user (email, display_name)
        values (${`cfo-${posted.value.id}@example.test`}, 'CFO') returning id`,
    );
    const result = await ledger.reverseEntry(
      acme.orgId,
      posted.value.id,
      'ok',
      actor[0]?.id ?? null,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.postedBy).toBe(actor[0]?.id);
  });

  it('reverses an entry whose period has since been locked (I2 + I4 together)', async () => {
    const posted = await ledger.postEntry(sale({ accrualDate: isoDate('2026-11-10') }));
    if (!posted.ok) throw new Error('setup failed');

    await h.asOrg(
      acme.orgId,
      (tx) => tx`
        insert into period_lock (org_id, legal_entity_id, locked_through_date)
        values (${acme.orgId}, ${acme.legalEntityId}, '2026-11-30')
        on conflict (org_id, legal_entity_id)
          do update set locked_through_date = excluded.locked_through_date`,
    );

    // The correction lands in an open period; only the back-reference touches
    // the locked one, and that is the single mutation I4 permits.
    const reversal = await ledger.reverseEntry(acme.orgId, posted.value.id, 'audit fix', null, {
      accrualDate: isoDate('2026-12-01'),
    });
    expect(reversal.ok).toBe(true);
    if (!reversal.ok) return;

    const rows = await h.asOrg(
      acme.orgId,
      (tx) => tx<{ reversed_by_id: string }[]>`
        select reversed_by_id from journal_entry where id = ${posted.value.id}`,
    );
    expect(rows[0]?.reversed_by_id).toBe(reversal.value.id);
  });
});

describe('getTrialBalance', () => {
  it('sums to zero across every account', async () => {
    const rows = await ledger.getTrialBalance({ orgId: acme.orgId });
    expect(rows.length).toBeGreaterThan(0);
    const total = rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(UZS));
    expect(total.toStorage()).toBe('0.0000');
  });

  it('narrows by date range', async () => {
    const rows = await ledger.getTrialBalance({
      orgId: acme.orgId,
      from: isoDate('2026-06-01'),
      to: isoDate('2026-06-01'),
    });
    const total = rows.reduce((acc, row) => acc.plus(row.balance), Money.zero(UZS));
    expect(total.toStorage()).toBe('0.0000');
    expect(rows.some((r) => r.code === '1010')).toBe(true);
  });

  it('narrows by legal entity', async () => {
    const rows = await ledger.getTrialBalance({
      orgId: acme.orgId,
      legalEntityIds: [acme.legalEntityId],
    });
    expect(rows.length).toBeGreaterThan(0);
    const none = await ledger.getTrialBalance({
      orgId: acme.orgId,
      legalEntityIds: [other.legalEntityId],
    });
    expect(none).toEqual([]);
    const empty = await ledger.getTrialBalance({ orgId: acme.orgId, legalEntityIds: [] });
    expect(empty).toEqual([]);
  });

  it('never shows another tenant figures (I8)', async () => {
    const acmeRows = await ledger.getTrialBalance({ orgId: acme.orgId });
    const otherRows = await ledger.getTrialBalance({ orgId: other.orgId });
    const acmeIds = new Set(acmeRows.map((r) => r.glAccountId));
    for (const row of otherRows) {
      expect(acmeIds.has(row.glAccountId)).toBe(false);
    }
  });

  it('reports debit, credit and balance in the functional currency', async () => {
    const rows = await ledger.getTrialBalance({
      orgId: acme.orgId,
      from: isoDate('2026-06-01'),
      to: isoDate('2026-06-01'),
    });
    const cash = rows.find((r) => r.code === '1010');
    expect(cash?.currency).toBe('UZS');
    expect(cash?.balance.toStorage()).toBe(
      cash === undefined ? '' : cash.debit.minus(cash.credit).toStorage(),
    );
  });
});
