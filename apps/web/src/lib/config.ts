/**
 * The web app talks to the API over HTTP and holds no database connection of
 * its own. It is a reader of reports, not a second place they are computed.
 */
export interface WebConfig {
  readonly apiBaseUrl: string;
  /**
   * The tenant this instance reads. Authentication does not exist yet, so it
   * comes from configuration rather than from a signed-in user — the same
   * temporary seam as the API's header resolver, and it disappears the same way.
   */
  readonly orgId: string;
}

export function readConfig(source: NodeJS.ProcessEnv = process.env): WebConfig {
  const apiBaseUrl = source['FINCORE_API_URL'] ?? 'http://127.0.0.1:3001';
  const orgId = source['FINCORE_ORG_ID'];
  if (orgId === undefined || orgId.trim() === '') {
    throw new Error(
      'FINCORE_ORG_ID is not set. Until sign-in exists the web app reads one ' +
        'organization, named here. `pnpm db:seed` prints the demo ids.',
    );
  }
  return { apiBaseUrl: apiBaseUrl.replace(/\/$/, ''), orgId: orgId.trim() };
}
