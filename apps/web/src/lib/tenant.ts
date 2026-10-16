import { getOrganization, type OrganizationDto } from './api';
import { activeOrgId, readConfig } from './config';

export interface Tenant {
  readonly orgId: string;
  readonly organization: OrganizationDto;
  /** Every organization this instance may read, for the picker. */
  readonly orgs: readonly { readonly id: string; readonly name: string }[];
}

/**
 * Resolves which organization a page is for, and what the picker should offer.
 *
 * The names are fetched rather than configured, so the picker cannot drift
 * from what the ledger actually holds — and each fetch goes through the API's
 * tenant guard, so an id this instance is not configured for never gets that
 * far.
 */
export async function readTenant(requested: string | undefined): Promise<Tenant> {
  const orgId = activeOrgId(requested);
  const { orgIds } = readConfig();
  const named = await Promise.all(
    orgIds.map(async (id) => {
      const organization = await getOrganization(id);
      return { id, name: organization.name };
    }),
  );
  const organization = await getOrganization(orgId);
  return { orgId, organization, orgs: named };
}
