import { drizzle } from 'drizzle-orm/postgres-js';
import { sql, type SQL } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>['db'];
export type Sql = postgres.Sql;

export interface DatabaseOptions {
  /** postgres:// connection string. */
  url: string;
  max?: number;
  /** Log every statement — integration tests only. */
  debug?: boolean;
}

export function createDatabase(options: DatabaseOptions): {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: postgres.Sql;
  close: () => Promise<void>;
} {
  const client = postgres(options.url, {
    max: options.max ?? 10,
    // Decimal columns must never round-trip through a JS number (I7).
    types: {},
    onnotice: () => undefined,
    ...(options.debug === true ? { debug: true } : {}),
  });
  const db = drizzle(client, { schema });
  return { db, client, close: () => client.end({ timeout: 5 }) };
}

/**
 * Binds a transaction to one tenant. Every RLS policy reads `app.org_id`, so
 * forgetting this yields zero rows rather than another tenant's data.
 */
export function setOrgId(orgId: string): SQL {
  return sql`select set_config('app.org_id', ${orgId}, true)`;
}
