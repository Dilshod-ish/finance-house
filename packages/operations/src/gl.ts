import { and, eq, inArray } from 'drizzle-orm';
import { glAccount, type Database } from '@fincore/db';
import { cashGlAccountFor, glAccountsByRole, type RegionPack } from '@fincore/region-pack-contract';
import type { AccountKind, GlAccountRole } from '@fincore/shared';

/** The database handle inside a transaction, as drizzle hands it over. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The GL accounts a cash posting needs, resolved once per import.
 *
 * Which internal account a movement lands on is a region-pack fact: the pack's
 * template says that an account of kind `bank` posts to one code and a cash
 * desk to another. The organization's own chart is materialised from that
 * template, so the pack gives the code and the chart gives the id. Nothing
 * here names a country's account numbers (CLAUDE.md §4).
 */
export interface GlResolver {
  /** The cash account serving `kind`, e.g. `bank` or `cash`. */
  cashFor(kind: AccountKind): string | null;
  /** The single account carrying `role`. */
  byRole(role: GlAccountRole): string | null;
}

export async function loadGlResolver(tx: Tx, orgId: string, pack: RegionPack): Promise<GlResolver> {
  const codes = new Set<string>();
  for (const seed of pack.chartOfAccountsTemplate) {
    codes.add(seed.code);
  }
  const rows = await tx
    .select({ id: glAccount.id, code: glAccount.code })
    .from(glAccount)
    .where(and(eq(glAccount.orgId, orgId), inArray(glAccount.code, [...codes])));

  const idByCode = new Map(rows.map((row) => [row.code, row.id]));

  return {
    cashFor(kind) {
      const seed = cashGlAccountFor(pack, kind);
      return seed === undefined ? null : (idByCode.get(seed.code) ?? null);
    },
    byRole(role) {
      const seed = glAccountsByRole(pack, role)[0];
      return seed === undefined ? null : (idByCode.get(seed.code) ?? null);
    },
  };
}
