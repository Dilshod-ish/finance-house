import { and, desc, eq, lte } from 'drizzle-orm';
import { fxRate, type Database } from '@fincore/db';
import { Decimal } from '@fincore/shared';
import type { CurrencyCode, IsoDate } from '@fincore/shared';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Units of `quote` per one unit of `base` on `on`, or the latest rate before
 * it. Returns null when the organization has no rate for the pair: posting a
 * foreign-currency movement without one would mean inventing a rate, and a
 * made-up rate is an error that compounds silently through every report
 * (CLAUDE.md §9 — fail loudly).
 *
 * The first reader of `fx_rate` in the codebase. It stays here until a second
 * caller needs it; a helper with one user does not need its own package.
 */
export async function rateOn(
  tx: Tx,
  orgId: string,
  base: CurrencyCode,
  quote: CurrencyCode,
  on: IsoDate,
): Promise<Decimal | null> {
  if (base === quote) {
    return new Decimal(1);
  }
  const rows = await tx
    .select({ rate: fxRate.rate })
    .from(fxRate)
    .where(
      and(
        eq(fxRate.orgId, orgId),
        eq(fxRate.baseCurrency, base),
        eq(fxRate.quoteCurrency, quote),
        lte(fxRate.asOfDate, on),
      ),
    )
    .orderBy(desc(fxRate.asOfDate))
    .limit(1);

  const row = rows[0];
  if (row !== undefined) {
    return new Decimal(row.rate);
  }

  // Stored the other way round is the same fact: 1/rate.
  const inverse = await tx
    .select({ rate: fxRate.rate })
    .from(fxRate)
    .where(
      and(
        eq(fxRate.orgId, orgId),
        eq(fxRate.baseCurrency, quote),
        eq(fxRate.quoteCurrency, base),
        lte(fxRate.asOfDate, on),
      ),
    )
    .orderBy(desc(fxRate.asOfDate))
    .limit(1);

  const back = inverse[0];
  return back === undefined ? null : new Decimal(1).dividedBy(new Decimal(back.rate));
}
