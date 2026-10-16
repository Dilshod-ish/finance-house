import { uzRegionPack } from '@fincore/region-pack-uz';
import type { RegionPack } from '@fincore/region-pack-contract';
import type { Database } from '@fincore/db';
import { seedShowcaseJournal, type ShowcaseJournal } from './journal.js';
import { seedShowcaseReference, type ShowcaseReference } from './reference.js';
import { SHOWCASE_PROFILES, SHOWCASE_WINDOW, type ShowcaseProfile } from './profiles.js';

export interface ShowcaseOrg {
  readonly profile: ShowcaseProfile;
  readonly reference: ShowcaseReference;
  readonly journal: ShowcaseJournal;
}

export interface ShowcaseResult {
  readonly orgs: readonly ShowcaseOrg[];
  readonly from: string;
  readonly to: string;
}

/**
 * Three organizations, six months, one platform — a B2B services exporter, a
 * retail chain and a garment manufacturer, each reporting in USD while most of
 * its costs are in som.
 *
 * The data is synthetic and calibrated to published benchmark ranges; see
 * `profiles.ts` for the sources and `fx.ts` for the rate anchors. No real
 * company's books are reproduced here, because none are published.
 */
export async function seedShowcase(
  db: Database,
  options: { pack?: RegionPack } = {},
): Promise<ShowcaseResult> {
  const pack = options.pack ?? uzRegionPack;
  const orgs: ShowcaseOrg[] = [];

  for (const profile of SHOWCASE_PROFILES) {
    const reference = await seedShowcaseReference(db, pack, profile);
    const journal = await seedShowcaseJournal(db, reference);
    orgs.push({ profile, reference, journal });
  }

  return { orgs, from: SHOWCASE_WINDOW.from, to: SHOWCASE_WINDOW.to };
}

export { SHOWCASE_PROFILES, SHOWCASE_WINDOW } from './profiles.js';
export type { ShowcaseProfile, Sector } from './profiles.js';
export type { ShowcaseReference } from './reference.js';
export type { ShowcaseJournal } from './journal.js';
