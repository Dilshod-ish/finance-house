import { Module, type DynamicModule, type OnApplicationShutdown } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { createDatabase, type Database } from '@fincore/db';
import { ENV, type Env } from '../config/env.js';

export const DATABASE = 'FINCORE_DATABASE';
const DATABASE_HANDLE = 'FINCORE_DATABASE_HANDLE';

interface DatabaseHandle {
  readonly db: Database;
  readonly close: () => Promise<void>;
}

/** Closes the pool on shutdown, so a redeploy does not leave connections open. */
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE_HANDLE) private readonly handle: DatabaseHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}

@Module({})
export class DbModule {
  /**
   * Global, and called once: a second call would open a second connection pool
   * for the same process.
   */
  static forRoot(): DynamicModule {
    return {
      module: DbModule,
      global: true,
      providers: [
        {
          provide: DATABASE_HANDLE,
          inject: [ENV],
          useFactory: (env: Env): DatabaseHandle => {
            const { db, close } = createDatabase({ url: env.databaseUrl });
            return { db, close };
          },
        },
        {
          provide: DATABASE,
          inject: [DATABASE_HANDLE],
          useFactory: (handle: DatabaseHandle): Database => handle.db,
        },
        DatabaseLifecycle,
      ],
      exports: [DATABASE],
    };
  }
}
