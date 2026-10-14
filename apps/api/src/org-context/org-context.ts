/** The one piece of request state the domain needs: which tenant is asking. */
export interface OrgContext {
  /**
   * The organization this request acts for, or null when it cannot be
   * established. Returning null is a 401-shaped answer, never a default tenant.
   */
  resolve(headers: Readonly<Record<string, string | string[] | undefined>>): string | null;
  /** Shown at boot so an operator can see which resolver is live. */
  readonly describe: string;
}

export const ORG_CONTEXT = 'FINCORE_ORG_CONTEXT';

export const ORG_HEADER = 'x-fincore-org';

/**
 * Development resolver: reads the tenant from a request header. This trusts the
 * caller completely, so it is not authentication and is never allowed to become
 * it — `resolveOrgContext` refuses to build it outside development.
 */
export function headerOrgContext(): OrgContext {
  return {
    describe: `header ${ORG_HEADER} (development only, no authentication)`,
    resolve(headers) {
      const value = headers[ORG_HEADER];
      const orgId = Array.isArray(value) ? value[0] : value;
      return orgId === undefined || orgId.trim().length === 0 ? null : orgId.trim();
    },
  };
}
