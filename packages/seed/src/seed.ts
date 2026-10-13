import { uzRegionPack } from '@fincore/region-pack-uz';
import type { RegionPack } from '@fincore/region-pack-contract';
import type { Database } from '@fincore/db';
import { DEMO_ORG_ID, SECOND_ORG_ID } from './ids.js';
import {
  DEMO_IDS,
  DEMO_WINDOW,
  seedReference,
  type ReferenceData,
  type SeedWindow,
} from './reference.js';
import { seedJournal, type SeededJournal } from './journal.js';

export interface SeedResult {
  readonly reference: ReferenceData;
  readonly journal: SeededJournal;
  /** A second tenant, so cross-tenant isolation can be asserted on real data. */
  readonly otherOrgId: string;
}

export interface SeedOptions {
  readonly pack?: RegionPack;
  readonly window?: SeedWindow;
  readonly orgId?: string;
  readonly otherOrgId?: string;
}

/**
 * Deterministic demo data: one organization with two legal entities and four
 * money accounts, roughly two hundred entries over three months including an
 * FX revaluation and a reversal, plus a second organization used to prove
 * tenant isolation.
 */
export async function seedDemo(db: Database, options: SeedOptions = {}): Promise<SeedResult> {
  const pack = options.pack ?? uzRegionPack;
  const window = options.window ?? DEMO_WINDOW;
  const orgId = options.orgId ?? DEMO_ORG_ID;
  const otherOrgId = options.otherOrgId ?? SECOND_ORG_ID;

  const reference = await seedReference(db, pack, {
    orgId,
    name: 'FinCore Demo',
    window,
    ids: DEMO_IDS,
  });
  const journal = await seedJournal(db, reference, window);

  // A neighbour tenant with its own books; nothing here may ever be visible
  // from the demo organization (I8).
  const otherReference = await seedReference(db, pack, {
    orgId: otherOrgId,
    name: 'Neighbour Tenant',
    window,
  });
  await seedJournal(db, otherReference, window);

  return { reference, journal, otherOrgId };
}
