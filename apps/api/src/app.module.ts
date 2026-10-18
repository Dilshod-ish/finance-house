import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { DbModule } from './db/db.module.js';
import { ENV, readEnv, type Env } from './config/env.js';
import { MetaModule } from './meta/meta.module.js';
import { OperationsModule } from './operations/operations.module.js';
import { OrgContextModule } from './org-context/org-context.module.js';
import { ReportsModule } from './reports/reports.module.js';

export interface AppModuleOptions {
  readonly env?: Env;
}

@Module({})
export class AppModule {
  /** `env` is injectable so tests can boot against a throwaway database. */
  static forRoot(options: AppModuleOptions = {}): DynamicModule {
    const env = options.env ?? readEnv();
    return {
      module: AppModule,
      imports: [DbModule.forRoot(), OrgContextModule, ReportsModule, OperationsModule, MetaModule],
      providers: [{ provide: ENV, useValue: env }],
      exports: [ENV],
      global: true,
    };
  }
}
