import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { ORG_CONTEXT } from './org-context.js';
import { resolveOrgContext } from './resolve.js';
import { OrgGuard } from './org.guard.js';

@Global()
@Module({
  providers: [
    { provide: ORG_CONTEXT, inject: [ENV], useFactory: (env: Env) => resolveOrgContext(env) },
    OrgGuard,
  ],
  exports: [ORG_CONTEXT, OrgGuard],
})
export class OrgContextModule {}
