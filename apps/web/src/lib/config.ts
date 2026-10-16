/**
 * The web app talks to the API over HTTP and holds no database connection of
 * its own. It is a reader of reports, not a second place they are computed.
 */
export interface WebConfig {
  readonly apiBaseUrl: string;
  /**
   * The tenants this instance may read, in the order they are offered.
   * Authentication does not exist yet, so the list comes from configuration
   * rather than from a signed-in user's memberships — the same temporary seam
   * as the API's header resolver, and it disappears the same way.
   *
   * It is an allow-list, not a hint: a request naming anything outside it is
   * refused rather than passed on, so the query string cannot reach a tenant
   * this instance was not configured for.
   */
  readonly orgIds: readonly string[];
}

export function readConfig(source: NodeJS.ProcessEnv = process.env): WebConfig {
  const apiBaseUrl = source['FINCORE_API_URL'] ?? 'http://127.0.0.1:3001';
  const raw = source['FINCORE_ORG_IDS'] ?? source['FINCORE_ORG_ID'] ?? '';
  const orgIds = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (orgIds.length === 0) {
    throw new Error(
      'FINCORE_ORG_IDS is not set. Until sign-in exists the web app reads the ' +
        'organizations named here, comma separated. `pnpm db:showcase` prints them.',
    );
  }
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), orgIds };
}

/**
 * The tenant a request is for. Falls back to the first configured one, and
 * never to whatever the query string asked for.
 */
export function activeOrgId(requested: string | undefined): string {
  const { orgIds } = readConfig();
  const first = orgIds[0];
  if (first === undefined) {
    throw new Error('no organization is configured');
  }
  return requested !== undefined && orgIds.includes(requested) ? requested : first;
}
