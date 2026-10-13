import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import { createDatabase } from './client.js';
import { MIGRATIONS_FOLDER } from './paths.js';

export interface MigrateOptions {
  url: string;
}

/** Applies every pending migration in `drizzle/`. Idempotent. */
export async function migrateToLatest({ url }: MigrateOptions): Promise<void> {
  const { db, close } = createDatabase({ url, max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await close();
  }
}

/**
 * Rolls back the most recent `steps` migrations using the hand-written files in
 * `drizzle/down/`, then forgets them in drizzle's journal table.
 */
export async function migrateDown({
  url,
  steps = 1,
}: MigrateOptions & { steps?: number }): Promise<string[]> {
  const { client, close } = createDatabase({ url, max: 1 });
  const applied: string[] = [];
  try {
    const files = (await readdir(join(MIGRATIONS_FOLDER, 'down')))
      .filter((f) => f.endsWith('.down.sql'))
      .sort()
      .reverse()
      .slice(0, steps);

    for (const file of files) {
      const body = await readFile(join(MIGRATIONS_FOLDER, 'down', file), 'utf8');
      await client.unsafe(body);
      applied.push(file);
    }
    await client.unsafe(
      `delete from drizzle.__drizzle_migrations where id in (
         select id from drizzle.__drizzle_migrations order by created_at desc limit ${String(steps)}
       )`,
    );
  } finally {
    await close();
  }
  return applied;
}

/** Drops and recreates the public schema. Refuses to run in production. */
export async function resetDatabase({ url }: MigrateOptions): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('db:reset refuses to run with NODE_ENV=production');
  }
  const { db, close } = createDatabase({ url, max: 1 });
  try {
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
    await db.execute(sql`drop schema if exists drizzle cascade`);
  } finally {
    await close();
  }
}
