import { createParamDecorator, InternalServerErrorException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { TenantRequest } from './org.guard.js';

/**
 * The tenant `OrgGuard` established. It throws rather than returning undefined:
 * a controller reached without the guard is a wiring bug, and a query with an
 * undefined `org_id` would read nothing and look like an empty report.
 */
export const OrgId = createParamDecorator((_data: unknown, execution: ExecutionContext): string => {
  const { orgId } = execution.switchToHttp().getRequest<TenantRequest>();
  if (orgId === undefined) {
    throw new InternalServerErrorException({
      error: 'no_tenant_on_request',
      message: 'OrgGuard did not run for this route.',
    });
  }
  return orgId;
});
