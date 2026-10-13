import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { createDatabase, migrateToLatest, type Database } from './index.js';

const ROLES_SQL = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docker',
  'initdb',
  '01-roles.sql',
);

export interface TestDatabase {
  url: string;
  db: Database;
  client: postgres.Sql;
  /** Runs `fn` as the unprivileged app role, bound to one tenant. */
  asOrg: <T>(orgId: string, fn: (tx: postgres.TransactionSql) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
}

interface Server {
  adminUrl: string;
  stop: () => Promise<void>;
}

/**
 * Integration tests run against a real Postgres 16, never a mock: RLS and
 * constraint triggers are exactly what a mock cannot reproduce. Uses
 * TEST_DATABASE_URL when set (a local cluster), otherwise testcontainers.
 */
async function startServer(): Promise<Server> {
  const existing = process.env['TEST_DATABASE_URL'];
  if (existing !== undefined && existing !== '') {
    return { adminUrl: existing, stop: (): Promise<void> => Promise.resolve() };
  }
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('fincore')
    .withUsername('fincore')
    .withPassword('fincore')
    .start();
  return {
    adminUrl: container.getConnectionUri(),
    stop: async () => {
      await container.stop();
    },
  };
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const server = await startServer();
  const name = `fincore_test_${randomBytes(6).toString('hex')}`;

  const admin = postgres(server.adminUrl, { max: 1, onnotice: () => undefined });
  // Only provision when missing: against a shared local cluster the test role
  // usually lacks CREATEROLE, and the role is already there.
  const [role] = await admin.unsafe<{ ok: boolean }[]>(
    `select exists (select 1 from pg_roles where rolname = 'fincore_app') as ok`,
  );
  if (role?.ok !== true) {
    await admin.unsafe(await readFile(ROLES_SQL, 'utf8'));
  }
  await admin.unsafe(`create database "${name}"`);
  await admin.end({ timeout: 5 });

  const url = new URL(server.adminUrl);
  url.pathname = `/${name}`;
  const target = url.toString();

  await migrateToLatest({ url: target });
  const { db, client, close } = createDatabase({ url: target, max: 4 });

  return {
    url: target,
    db,
    client,
    asOrg: <T>(orgId: string, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
      client.begin(async (tx) => {
        await tx.unsafe('set local role fincore_app');
        await tx`select set_config('app.org_id', ${orgId}, true)`;
        return fn(tx);
        // `begin` widens the callback result; the generic above is the contract.
      }) as unknown as Promise<T>,
    close: async () => {
      await close();
      const dropper = postgres(server.adminUrl, { max: 1, onnotice: () => undefined });
      await dropper.unsafe(`drop database if exists "${name}" with (force)`);
      await dropper.end({ timeout: 5 });
      await server.stop();
    },
  };
}
