import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDown, migrateToLatest } from '../src/index.js';
import { createTestDatabase, type TestDatabase } from './harness.js';

let h: TestDatabase;

beforeAll(async () => {
  h = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await h.close();
});

async function tableCount(db: TestDatabase): Promise<number> {
  const rows = await db.client<{ n: number }[]>`
    select count(*)::int as n from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r'`;
  return rows[0]?.n ?? -1;
}

async function triggerCount(db: TestDatabase): Promise<number> {
  const rows = await db.client<{ n: number }[]>`
    select count(*)::int as n from pg_trigger
     where not tgisinternal and tgrelid in ('journal_entry'::regclass, 'journal_line'::regclass)`;
  return rows[0]?.n ?? -1;
}

describe('migrations', () => {
  it('applies cleanly to a fresh database', async () => {
    // createTestDatabase() created an empty database and migrated it.
    expect(await tableCount(h)).toBe(14);
    expect(await triggerCount(h)).toBe(6);
  });

  it('is idempotent when re-run', async () => {
    await migrateToLatest({ url: h.url });
    expect(await tableCount(h)).toBe(14);
  });

  it('rolls back and re-applies (reversible)', async () => {
    const rolledBack = await migrateDown({ url: h.url, steps: 2 });
    expect(rolledBack).toEqual(['0001_invariants.down.sql', '0000_init.down.sql']);
    expect(await tableCount(h)).toBe(0);

    await migrateToLatest({ url: h.url });
    expect(await tableCount(h)).toBe(14);
    expect(await triggerCount(h)).toBe(6);
  });
});
