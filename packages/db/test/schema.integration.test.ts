import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TENANT_SCOPED_TABLES } from '../src/index.js';
import { createTestDatabase, type TestDatabase } from '../src/testing.js';

let h: TestDatabase;

beforeAll(async () => {
  h = await createTestDatabase();
}, 180_000);

afterAll(async () => {
  await h.close();
});

const ALL_TABLES = [
  'account',
  'app_user',
  'article',
  'audit_log',
  'counterparty',
  'direction',
  'fx_rate',
  'gl_account',
  'journal_entry',
  'journal_line',
  'legal_entity',
  'membership',
  'organization',
  'period_lock',
];

describe('schema', () => {
  it('creates exactly the tables the bootstrap asked for', async () => {
    const rows = await h.client<{ relname: string }[]>`
      select relname from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'
       order by relname`;
    expect(rows.map((r) => r.relname)).toEqual(ALL_TABLES);
  });

  it('enables AND forces RLS on every tenant-scoped table (I8)', async () => {
    const rows = await h.client<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`
      select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`;
    const byName = new Map(rows.map((r) => [r.relname, r]));

    for (const table of [...TENANT_SCOPED_TABLES, 'organization']) {
      const row = byName.get(table);
      expect(row, `${table} missing`).toBeDefined();
      // FORCE matters: without it the table owner silently bypasses the policy.
      expect([table, row?.relrowsecurity, row?.relforcerowsecurity]).toEqual([table, true, true]);
    }
  });

  it('leaves app_user out of RLS on purpose (one human, many organizations)', () => {
    expect(TENANT_SCOPED_TABLES).not.toContain('app_user');
  });

  it('has an isolation policy on every tenant-scoped table', async () => {
    const rows = await h.client<{ tablename: string; policyname: string }[]>`
      select tablename, policyname from pg_policies where schemaname = 'public'`;
    const tables = new Set(rows.map((r) => r.tablename));
    for (const table of [...TENANT_SCOPED_TABLES, 'organization']) {
      expect([table, tables.has(table)]).toEqual([table, true]);
    }
  });

  it('carries the indexes the §5.3 access patterns need', async () => {
    const rows = await h.client<{ indexname: string }[]>`
      select indexname from pg_indexes where schemaname = 'public'`;
    const names = new Set(rows.map((r) => r.indexname));
    for (const expected of [
      'journal_entry_org_entity_accrual_idx',
      'journal_entry_org_cash_date_idx',
      'journal_entry_org_source_idx',
      'journal_entry_org_idempotency_uq',
      'journal_line_org_gl_entry_idx',
      'journal_line_entry_idx',
      'journal_line_org_direction_idx',
      'journal_line_org_account_idx',
      'journal_line_org_article_idx',
      'journal_line_org_counterparty_idx',
      'journal_line_org_source_idx',
      'fx_rate_org_pair_date_idx',
      'gl_account_org_role_idx',
    ]) {
      expect([expected, names.has(expected)]).toEqual([expected, true]);
    }
  });

  it('stores money as numeric(20,4) and fx rates as numeric(20,10) (I7)', async () => {
    const rows = await h.client<
      {
        table_name: string;
        column_name: string;
        numeric_precision: number;
        numeric_scale: number;
      }[]
    >`
      select table_name, column_name, numeric_precision, numeric_scale
        from information_schema.columns
       where table_schema = 'public' and data_type = 'numeric'
       order by table_name, column_name`;
    const money = rows.filter((r) => r.column_name.startsWith('amount'));
    expect(money.length).toBeGreaterThan(0);
    for (const row of money) {
      expect([row.column_name, row.numeric_precision, row.numeric_scale]).toEqual([
        row.column_name,
        20,
        4,
      ]);
    }
    const fx = rows.filter((r) => r.column_name === 'fx_rate' || r.column_name === 'rate');
    for (const row of fx) {
      expect([row.table_name, row.numeric_precision, row.numeric_scale]).toEqual([
        row.table_name,
        20,
        10,
      ]);
    }
  });
});
