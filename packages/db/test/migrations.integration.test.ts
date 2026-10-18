import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDown, migrateToLatest } from '../src/index.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

/** Every table the migrations create. Bumped deliberately, never guessed. */
const TABLES = 16;

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
    expect(await tableCount(h)).toBe(TABLES);
    expect(await triggerCount(h)).toBe(6);
  });

  it('is idempotent when re-run', async () => {
    await migrateToLatest({ url: h.url });
    expect(await tableCount(h)).toBe(TABLES);
  });

  it('rolls back and re-applies (reversible)', async () => {
    const rolledBack = await migrateDown({ url: h.url, steps: 5 });
    expect(rolledBack).toEqual([
      '0004_operations.down.sql',
      '0003_gl_account_role.down.sql',
      '0002_reversal_in_locked_period.down.sql',
      '0001_invariants.down.sql',
      '0000_init.down.sql',
    ]);
    expect(await tableCount(h)).toBe(0);

    await migrateToLatest({ url: h.url });
    expect(await tableCount(h)).toBe(TABLES);
    expect(await triggerCount(h)).toBe(6);
  });
});
