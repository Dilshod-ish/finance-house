import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { glAccount, journalEntry, journalLine, legalEntity, type Database } from '@fincore/db';
import { Money, currency as toCurrency, type GlAccountRole, type IsoDate } from '@fincore/shared';
import type { RoleBalances } from './build.js';

export interface BalanceSheetQuery {
  readonly orgId: string;
  readonly legalEntityIds?: readonly string[];
  /** Position at the close of this date, inclusive. */
  readonly asOf: IsoDate;
}

export interface RoleBalanceSet {
  readonly currency: string;
  readonly balances: RoleBalances;
}

/**
 * Role balances per functional currency, each in its natural direction.
 *
 * Grouped by functional currency rather than summed across them: consolidating
 * into one presentation currency needs the FX policy of CLAUDE.md §5, which is
 * not built, and a total that mixes currencies would be a wrong number.
 */
export async function queryRoleBalances(
  db: Database,
  query: BalanceSheetQuery,
): Promise<readonly RoleBalanceSet[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${query.orgId}, true)`);

    const conditions = [
      eq(journalLine.orgId, query.orgId),
      lte(journalEntry.accrualDate, query.asOf),
    ];
    if (query.legalEntityIds !== undefined) {
      conditions.push(inArray(journalEntry.legalEntityId, [...query.legalEntityIds]));
    }

    const rows = await tx
      .select({
        currency: legalEntity.functionalCurrency,
        role: glAccount.role,
        // Natural direction: debit-normal for assets and expenses, credit-normal
        // for liabilities, equity and income.
        natural: sql<string>`sum(
          case when ${glAccount.type} in ('asset', 'expense')
               then case when ${journalLine.side} = 'D'
                         then ${journalLine.amountFunctional}
                         else -${journalLine.amountFunctional} end
               else case when ${journalLine.side} = 'C'
                         then ${journalLine.amountFunctional}
                         else -${journalLine.amountFunctional} end
          end)`,
      })
      .from(journalLine)
      .innerJoin(journalEntry, eq(journalEntry.id, journalLine.entryId))
      .innerJoin(glAccount, eq(glAccount.id, journalLine.glAccountId))
      .innerJoin(legalEntity, eq(legalEntity.id, journalEntry.legalEntityId))
      .where(and(...conditions))
      .groupBy(legalEntity.functionalCurrency, glAccount.role)
      // Ordered in SQL rather than sorted afterwards, so the result does not
      // depend on the planner and the Map below comes out already in order.
      .orderBy(legalEntity.functionalCurrency);

    // The query groups by (functional currency, role), so each pair arrives
    // exactly once — no accumulation needed here.
    const byCurrency = new Map<string, Map<GlAccountRole, Money>>();
    for (const row of rows) {
      const code = row.currency.trim();
      const bucket = byCurrency.get(code) ?? new Map<GlAccountRole, Money>();
      bucket.set(row.role, Money.of(row.natural, toCurrency(code)));
      byCurrency.set(code, bucket);
    }

    return [...byCurrency.entries()].map(([code, balances]) => ({ currency: code, balances }));
  });
}
