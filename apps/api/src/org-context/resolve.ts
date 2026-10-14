import type { Env } from '../config/env.js';
import { headerOrgContext, type OrgContext } from './org-context.js';

/**
 * Picks the tenant resolver for this environment, or refuses to start.
 *
 * Authentication does not exist yet, so the only resolver available is the
 * header one, which trusts its caller. Rather than leave that on a code path
 * that could reach production (CLAUDE.md §9), this throws: a production deploy
 * without a real resolver fails at boot, loudly, instead of serving every
 * tenant's ledger to anyone who guesses an id.
 *
 * When authentication lands, it registers its own `OrgContext` here and nothing
 * else in the API changes.
 */
export function resolveOrgContext(env: Env): OrgContext {
  if (env.nodeEnv === 'production') {
    throw new Error(
      'No authenticated tenant resolver is configured. The header resolver is ' +
        'refused in production because it trusts the caller. Register a real ' +
        'OrgContext before deploying.',
    );
  }
  if (!env.insecureOrgHeader) {
    throw new Error(
      'No tenant resolver is configured. Set FINCORE_INSECURE_ORG_HEADER=1 to ' +
        `resolve the tenant from the request header in ${env.nodeEnv}, and read ` +
        'resolveOrgContext before you do.',
    );
  }
  return headerOrgContext();
}
