import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '@fincore/db';
import { DATABASE } from '../db/db.module.js';
import { ENV, type Env } from '../config/env.js';

/**
 * Unauthenticated on purpose, and it names no tenant. It reports whether the
 * database answers, because an API that is up while the ledger is unreachable
 * is not healthy.
 */
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  async health(): Promise<{ status: string; database: string; environment: string }> {
    const [row] = await this.db.execute<{ ok: number }>(sql`select 1 as ok`);
    return {
      status: 'ok',
      database: row?.ok === 1 ? 'ok' : 'unexpected',
      environment: this.env.nodeEnv,
    };
  }
}
