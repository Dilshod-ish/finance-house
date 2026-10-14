import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ORG_CONTEXT, ORG_HEADER, type OrgContext } from './org-context.js';

export interface TenantRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  orgId?: string;
}

/**
 * Establishes the tenant for every request that reaches a controller. There is
 * no fallback: without a resolvable organization the request is refused, so a
 * missing header can never read another tenant's ledger.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(@Inject(ORG_CONTEXT) private readonly context: OrgContext) {}

  canActivate(execution: ExecutionContext): boolean {
    const request = execution.switchToHttp().getRequest<TenantRequest>();
    const orgId = this.context.resolve(request.headers);
    if (orgId === null) {
      throw new UnauthorizedException({
        error: 'no_organization',
        message: `This request carries no organization. Send ${ORG_HEADER}.`,
      });
    }
    request.orgId = orgId;
    return true;
  }
}
